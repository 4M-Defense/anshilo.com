import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AssistantError, sendChat, type ChatMessage } from '@/api/assistant';
import type { ProductCardData } from '@/api/types';
import { Badge, EmptyState, Icon, ProductCard } from '@/components';
import { isAssistantConfigured } from '@/config';
import { alignEnd, colors, inputAlign, layout, radius, rtlText, shadows, spacing, typography } from '@/theme';

/**
 * תקרת ההקשר: רק 12 ההודעות האחרונות נשלחות לשרת. שיחה ארוכה לא מנפחת
 * את הבקשה — והעוזר ממילא לא צריך לזכור מה נשאל לפני חצי שעה.
 */
/*
 * חלון אי-זוגי בכוונה: תמליל מתחלף שנחתך לחלון זוגי מתחיל בתשובת עוזר,
 * ו-Anthropic דוחה תמליל שלא פותח ב-user. השרת גם מיישר בעצמו (הגנה כפולה),
 * אבל אין סיבה לשלוח חלון שידוע מראש כשבור.
 */
const MAX_TRANSCRIPT = 11;
/** תקרת השרת להודעה אחת — נאכפת גם כאן כדי שהודעה ארוכה לא תורעל בתמליל */
const MAX_INPUT_LENGTH = 4000;

/** שאלות פתיחה — לחיצה שולחת מיד, בלי הקלדה */
const STARTERS = [
  'איזו מברגה מתאימה לשימוש ביתי?',
  'מה צריך לאיטום מרפסת?',
  'כלי 18V של מקיטה למסגרות',
  'איך בוחרים מכונת שטיפה בלחץ?',
] as const;

/** הודעה על המסך — הודעת צ'אט + המוצרים שהעוזר צירף אליה */
interface Bubble {
  id: string;
  role: ChatMessage['role'];
  content: string;
  products?: ProductCardData[];
}

/** מזהי הודעות — רצים ברמת המודול, אין צורך ביותר מזה */
let bubbleSeq = 0;
const nextId = () => `msg-${++bubbleSeq}`;

/* ---------- מחוון הקלדה — שלוש נקודות בגל ---------- */

function TypingDots() {
  const dots = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    // כל נקודה עולה ויורדת בתורה; ההשהיות המשלימות שומרות על אורך מחזור זהה
    const loops = dots.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 140),
          Animated.timing(v, { toValue: 1, duration: 320, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 320, useNativeDriver: true }),
          Animated.delay((dots.length - 1 - i) * 140),
        ])
      )
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [dots]);

  return (
    <View style={[styles.bubble, styles.bubbleAssistant, styles.typingBubble]}>
      {dots.map((v, i) => (
        <Animated.View
          key={i}
          style={[
            styles.typingDot,
            {
              opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
              transform: [
                { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

/* ==================== מסך העוזר ==================== */

export default function AssistantScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string }>();
  const configured = isAssistantConfigured();

  const [messages, setMessages] = useState<Bubble[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * מקור האמת של התמליל — ref ולא state, כי `send` נקרא גם מאפקט ההרצה
   * הראשונה (הפרמטר q) וגם מצ'יפים, לפני שה-state הספיק להתעדכן.
   */
  const messagesRef = useRef<Bubble[]>([]);
  const sendingRef = useRef(false);
  const autoSent = useRef(false);

  const pushMessage = useCallback((bubble: Bubble) => {
    messagesRef.current = [...messagesRef.current, bubble];
    setMessages(messagesRef.current);
  }, []);

  /**
   * שולח את התמליל הנוכחי לשרת. התמליל חייב להסתיים בהודעת משתמש —
   * `send` דואג לזה, ו-"נסו שוב" מנצל את זה: ההודעה שנכשלה כבר שם,
   * אז שליחה חוזרת היא בדיוק אותה קריאה.
   */
  const deliver = useCallback(async () => {
    sendingRef.current = true;
    setSending(true);
    setError(null);
    const transcript: ChatMessage[] = messagesRef.current
      .slice(-MAX_TRANSCRIPT)
      .map((m) => ({ role: m.role, content: m.content }));
    /* גם עם חלון אי-זוגי — לא שולחים תמליל שנפתח בתשובת עוזר */
    while (transcript.length > 0 && transcript[0].role !== 'user') transcript.shift();
    try {
      const { reply, products } = await sendChat(transcript);
      pushMessage({ id: nextId(), role: 'assistant', content: reply, products });
    } catch (err) {
      if (err instanceof AssistantError && err.status === 400) {
        /*
         * 400 פירושו שההודעה עצמה פסולה (ארוכה/ריקה) — השארתה בתמליל הייתה
         * מרעילה כל שליחה עתידית שחולקת איתה חלון. מוציאים אותה מהתמליל
         * ומחזירים את הטקסט לשדה הקלט, שהמשתמש יקצר וישלח שוב.
         */
        const last = messagesRef.current[messagesRef.current.length - 1];
        if (last?.role === 'user') {
          messagesRef.current = messagesRef.current.slice(0, -1);
          setMessages(messagesRef.current);
          setText(last.content);
        }
        setError(err.message);
      } else {
        setError(err instanceof AssistantError ? err.message : 'שגיאה זמנית. נסו שוב.');
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [pushMessage]);

  const send = useCallback(
    (raw: string) => {
      const content = raw.trim();
      // הודעה אחת בכל רגע — שליחה כפולה מערבבת את סדר התשובות
      if (content === '' || sendingRef.current) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setText('');
      pushMessage({ id: nextId(), role: 'user', content });
      deliver();
    },
    [pushMessage, deliver]
  );

  const retry = useCallback(() => {
    if (sendingRef.current || messagesRef.current.length === 0) return;
    deliver();
  }, [deliver]);

  /**
   * פרמטר q — שאלה שהגיעה מבחוץ (למשל ממסך החיפוש) נשלחת אוטומטית
   * כהודעה הראשונה. פעם אחת בלבד: רענון פרמטרים לא ישלח אותה שוב.
   */
  useEffect(() => {
    if (autoSent.current) return;
    autoSent.current = true;
    const initial = typeof params.q === 'string' ? params.q.trim() : '';
    if (initial !== '' && configured) send(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  /* ---------- רשימת ההודעות ---------- */

  // רשימה הפוכה: החדשה ביותר ראשונה בנתונים — ולמטה על המסך
  const listData = useMemo(() => [...messages].reverse(), [messages]);

  const renderBubble = useCallback(
    ({ item }: ListRenderItemInfo<Bubble>) => {
      if (item.role === 'user') {
        return (
          <View style={[styles.bubble, styles.bubbleUser]}>
            <Text style={styles.bubbleUserText}>{rtlText(item.content)}</Text>
          </View>
        );
      }
      return (
        <View style={styles.assistantBlock}>
          <View style={[styles.bubble, styles.bubbleAssistant]}>
            <Text style={styles.bubbleAssistantText}>{rtlText(item.content)}</Text>
          </View>
          {item.products != null && item.products.length > 0 && (
            // ההמלצות מתחת לבועה — כרטיסי מוצר אמיתיים, לחיצה מנווטת למוצר
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.productsStrip}
            >
              {item.products.map((p) => (
                <ProductCard key={p.id} product={p} width={170} showStock={false} />
              ))}
            </ScrollView>
          )}
        </View>
      );
    },
    []
  );

  // ברשימה הפוכה ה-ListHeaderComponent מרונדר בתחתית הוויזואלית —
  // בדיוק היכן שמחוון ההקלדה ושורת השגיאה צריכים להופיע
  const listHeader = sending ? (
    <TypingDots />
  ) : error != null ? (
    <View style={styles.errorRow}>
      <Icon name="alert-circle-outline" size={18} color={colors.danger} />
      <Text style={styles.errorText} numberOfLines={3}>
        {rtlText(error)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="נסו שוב"
        onPress={retry}
        hitSlop={spacing.xs}
        style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
      >
        <Text style={styles.retryText}>נסו שוב</Text>
      </Pressable>
    </View>
  ) : null;

  const canSend = text.trim() !== '' && !sending;

  return (
    <View style={styles.screen}>
      {/* הכותרת המובנית מוסתרת — המסך בונה כותרת משלו עם תת-כותרת ותגית */}
      <Stack.Screen options={{ headerShown: false, title: 'המומחה של שילו' }} />

      {/* ----- כותרת ----- */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="חזרה"
          onPress={goBack}
          hitSlop={spacing.xs}
          style={({ pressed }) => [styles.backButton, pressed && styles.backPressed]}
        >
          {/* "חזרה" ב-RTL מצביעה ימינה — chevron-forward פיזי, בכוונה בלי dir */}
          <Icon name="chevron-forward" size={22} color={colors.ink} />
        </Pressable>
        <View style={styles.headerTitles}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              המומחה של שילו
            </Text>
            <Badge label="Beta" variant="soft" />
          </View>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            יועץ הקנייה החכם של החנות
          </Text>
        </View>
      </View>

      {/* גילוי נאות — העוזר ממליץ, עמוד המוצר קובע */}
      <View style={styles.disclaimerRow}>
        <Text style={styles.disclaimerText} numberOfLines={1} allowFontScaling={false}>
          העוזר עשוי לטעות — המחיר והמלאי הקובעים הם בעמוד המוצר.
        </Text>
      </View>

      {!configured ? (
        /* אין כתובת שרת — מסבירים מה חסר במקום להציג צ'אט שלעולם לא יענה */
        <View style={styles.noticeWrap}>
          <EmptyState
            icon="construct-outline"
            title="העוזר עדיין לא חובר"
            text={
              'כתובת השרת של העוזר חסרה בהגדרות האפליקציה ' +
              '(EXPO_PUBLIC_ASSISTANT_URL). ברגע שהיא תוגדר — הצ׳אט יופיע כאן.'
            }
          />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          {messages.length === 0 ? (
            /* מצב פתיחה — כרטיס ברוכים הבאים ושאלות מוכנות */
            <ScrollView
              contentContainerStyle={styles.welcomeContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.welcomeCard}>
                <View style={styles.welcomeIconWrap}>
                  <Icon name="construct" size={28} color={colors.accent} />
                </View>
                <Text style={styles.welcomeTitle}>שלום! כאן המומחה של שילו 🛠️</Text>
                <Text style={styles.welcomeText}>
                  שאלו אותי על כלים, חומרים והתאמה לעבודה — ואמליץ מהקטלוג של שילו
                </Text>
              </View>
              <View style={styles.chipsWrap}>
                {STARTERS.map((starter) => (
                  <Pressable
                    key={starter}
                    accessibilityRole="button"
                    accessibilityLabel={`שאלה: ${starter}`}
                    onPress={() => send(starter)}
                    hitSlop={spacing.xs}
                    style={({ pressed }) => [styles.starterChip, pressed && styles.pressed]}
                  >
                    <Icon name="chatbubble-ellipses-outline" size={14} color={colors.accent} />
                    <Text style={styles.starterChipText} numberOfLines={2}>
                      {starter}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          ) : (
            <FlatList
              data={listData}
              inverted
              keyExtractor={(item) => item.id}
              renderItem={renderBubble}
              ListHeaderComponent={listHeader}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
            />
          )}

          {/* ----- שורת הקלט ----- */}
          <View
            style={[
              styles.inputBar,
              { paddingBottom: Math.max(insets.bottom, spacing.sm) + spacing.xs },
            ]}
          >
            <TextInput
              maxLength={MAX_INPUT_LENGTH}
              value={text}
              onChangeText={setText}
              placeholder="כתבו שאלה למומחה…"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              multiline
              accessibilityLabel="שדה שאלה למומחה"
              allowFontScaling={false}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="שליחה"
              accessibilityState={{ disabled: !canSend }}
              disabled={!canSend}
              onPress={() => send(text)}
              hitSlop={spacing.xs}
              style={({ pressed }) => [
                styles.sendButton,
                !canSend && styles.sendButtonDisabled,
                pressed && canSend && styles.sendButtonPressed,
              ]}
            >
              {/* אייקון כיווני — dir הופך אותו לכיוון השליחה תחת RTL */}
              <Icon name="send" size={18} color={colors.onAccent} dir />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.page,
  },
  flex: {
    flex: 1,
  },

  /* כותרת */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm + 2,
    backgroundColor: colors.surface,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: layout.touchCompact,
    height: layout.touchCompact,
    borderRadius: radius.pill,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  headerTitles: {
    flex: 1,
    gap: spacing.xxs,
    alignItems: 'flex-start',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerTitle: {
    fontSize: typography.h3,
    fontWeight: '800',
    color: colors.ink,
    textAlign: alignEnd,
    writingDirection: 'rtl',
  },
  headerSubtitle: {
    fontSize: typography.tiny,
    fontWeight: '500',
    color: colors.textMuted,
    textAlign: alignEnd,
    writingDirection: 'rtl',
  },

  /* גילוי נאות */
  disclaimerRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs + 1,
    backgroundColor: colors.surfaceAlt,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.border,
  },
  disclaimerText: {
    fontSize: typography.tiny,
    color: colors.textMuted,
    textAlign: 'center',
    writingDirection: 'rtl',
  },

  /* העוזר לא חובר */
  noticeWrap: {
    flex: 1,
    justifyContent: 'center',
  },

  /* מצב פתיחה */
  welcomeContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.lg,
  },
  welcomeCard: {
    backgroundColor: colors.surface,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    ...shadows.sm,
  },
  welcomeIconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  welcomeTitle: {
    fontSize: typography.h3,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  welcomeText: {
    fontSize: typography.small,
    lineHeight: Math.round(typography.small * 1.55),
    color: colors.textMuted,
    textAlign: 'center',
    writingDirection: 'rtl',
    maxWidth: 300,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  starterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 1,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    maxWidth: '100%',
  },
  starterChipText: {
    flexShrink: 1,
    fontSize: typography.small,
    fontWeight: '700',
    color: colors.accentHover,
    textAlign: alignEnd,
    writingDirection: 'rtl',
  },

  /* בועות */
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm + 2,
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: radius.card,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 2,
  },
  /* צד הכותב — flex-end הוא שמאל תחת RTL, כמו הודעות יוצאות בוואטסאפ */
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accent,
  },
  bubbleUserText: {
    fontSize: typography.body,
    lineHeight: Math.round(typography.body * 1.5),
    color: colors.onAccent,
    textAlign: alignEnd,
    writingDirection: 'rtl',
  },
  bubbleAssistant: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: layout.hairline,
    borderColor: colors.border,
  },
  bubbleAssistantText: {
    fontSize: typography.body,
    lineHeight: Math.round(typography.body * 1.55),
    color: colors.text,
    textAlign: alignEnd,
    writingDirection: 'rtl',
  },
  assistantBlock: {
    gap: spacing.sm,
  },
  productsStrip: {
    gap: spacing.md,
    paddingVertical: spacing.xxs,
  },

  /* מחוון הקלדה */
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingVertical: spacing.md,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.textMuted,
  },

  /* שגיאה + נסו שוב */
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: {
    flex: 1,
    fontSize: typography.small,
    lineHeight: typography.small + 5,
    color: colors.text,
    textAlign: alignEnd,
    writingDirection: 'rtl',
  },
  retryButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  retryText: {
    fontSize: typography.small,
    fontWeight: '700',
    color: colors.danger,
  },
  pressed: {
    opacity: 0.6,
  },

  /* שורת הקלט */
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm + 2,
    backgroundColor: colors.surface,
    borderTopWidth: layout.hairline,
    borderTopColor: colors.border,
    ...shadows.raised,
  },
  input: {
    flex: 1,
    minHeight: layout.touchMin,
    /* עד ~4 שורות — מעבר לזה השדה נגלל פנימית במקום לבלוע את המסך */
    maxHeight: 20 * 4 + spacing.sm * 2,
    fontSize: typography.body,
    lineHeight: 20,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.lg,
    borderWidth: layout.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSunken,
    /* inputAlign ולא alignEnd — ב-TextInput היישור פיזי, ראו theme.ts */
    textAlign: inputAlign,
    writingDirection: 'rtl',
  },
  sendButton: {
    width: layout.touchMin,
    height: layout.touchMin,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonPressed: {
    backgroundColor: colors.accentHover,
  },
  sendButtonDisabled: {
    backgroundColor: colors.borderStrong,
  },
});
