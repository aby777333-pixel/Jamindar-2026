import { useMemo, useState, useEffect } from "react";
import { Modal, Pressable, ScrollView, Text, View, Alert, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "./ui";
import { colors, space, type as T } from "@/lib/theme";
import {
  useVisitSlots,
  useRefreshVisits,
  bookVisit,
  rescheduleVisit,
  slotDate,
  type SiteVisit,
  type VisitSlot,
} from "@/lib/visits";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MAX_DAYS_AHEAD = 60;

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Month grid — no date-picker dependency, so nothing new enters the stack. */
function MonthCalendar({
  selected,
  onSelect,
  minDate,
  maxDate,
}: {
  selected: Date;
  onSelect: (d: Date) => void;
  minDate: Date;
  maxDate: Date;
}) {
  const [view, setView] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));

  const cells = useMemo(() => {
    const out: (Date | null)[] = [];
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    for (let i = 0; i < first.getDay(); i++) out.push(null);
    for (let d = 1; d <= days; d++) out.push(new Date(view.getFullYear(), view.getMonth(), d));
    return out;
  }, [view]);

  const canPrev = view > new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const canNext = new Date(view.getFullYear(), view.getMonth() + 1, 1) <= maxDate;

  return (
    <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <Pressable
          onPress={() => canPrev && setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
          hitSlop={8}
          style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="chevron-back" size={19} color={canPrev ? colors.ink : colors.border} />
        </Pressable>
        <Text style={{ fontWeight: "700", fontSize: 15, color: colors.ink }}>
          {view.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
        </Text>
        <Pressable
          onPress={() => canNext && setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
          hitSlop={8}
          style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="chevron-forward" size={19} color={canNext ? colors.ink : colors.border} />
        </Pressable>
      </View>

      <View style={{ flexDirection: "row" }}>
        {WEEKDAYS.map((w, i) => (
          <View key={`${w}${i}`} style={{ width: `${100 / 7}%`, alignItems: "center", paddingVertical: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: colors.inkFaint }}>{w}</Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {cells.map((d, i) => {
          if (!d) return <View key={`b${i}`} style={{ width: `${100 / 7}%`, height: 42 }} />;
          const disabled = d < minDate || d > maxDate;
          const on = sameDay(d, selected);
          return (
            <Pressable
              key={d.toISOString()}
              disabled={disabled}
              onPress={() => onSelect(d)}
              style={{ width: `${100 / 7}%`, height: 42, alignItems: "center", justifyContent: "center" }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: on ? colors.brand : "transparent",
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: on ? "800" : "500",
                    color: on ? "#fff" : disabled ? colors.border : colors.ink,
                  }}
                >
                  {d.getDate()}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Book a site visit, or reschedule an existing one when `visit` is supplied.
 * Confirmation is shown before anything is written.
 */
export function SiteVisitSheet({
  visible,
  onClose,
  propertyId,
  propertyLabel,
  visit,
}: {
  visible: boolean;
  onClose: () => void;
  propertyId: string;
  propertyLabel: string;
  visit?: SiteVisit | null;
}) {
  const insets = useSafeAreaInsets();
  const { data: slots = [], isLoading: slotsLoading } = useVisitSlots();
  const refresh = useRefreshVisits();
  const [busy, setBusy] = useState(false);

  const { minDate, maxDate } = useMemo(() => {
    const min = startOfDay(new Date());
    min.setDate(min.getDate() + 1); // earliest visit is tomorrow
    const max = startOfDay(new Date());
    max.setDate(max.getDate() + MAX_DAYS_AHEAD);
    return { minDate: min, maxDate: max };
  }, []);

  const [day, setDay] = useState<Date>(minDate);
  const [slotId, setSlotId] = useState<string | null>(null);

  // Re-seed from the existing booking each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    const from = visit?.scheduled_at ? startOfDay(new Date(visit.scheduled_at)) : minDate;
    setDay(from < minDate ? minDate : from);
    setSlotId(null);
  }, [visible, visit?.id]);

  const slot: VisitSlot | undefined =
    slots.find((s) => s.id === slotId) ??
    slots.find((s) => s.label === visit?.slot_label) ??
    slots[0];

  const when = slot ? slotDate(day, slot) : null;
  const whenLabel = when
    ? `${when.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} · ${slot!.label}`
    : "—";

  async function submit() {
    if (!slot || !when) {
      Alert.alert("Pick a time", "Please choose a time slot for your visit.");
      return;
    }
    Alert.alert(
      visit ? "Confirm new time" : "Confirm your visit",
      `${propertyLabel}\n${whenLabel}\n\n${
        visit
          ? "Everyone involved will be notified of the change."
          : "Our team will confirm and meet you on site."
      }`,
      [
        { text: "Back", style: "cancel" },
        {
          text: visit ? "Reschedule" : "Confirm visit",
          onPress: async () => {
            setBusy(true);
            try {
              if (visit) await rescheduleVisit(visit.id, when, slot.label);
              else await bookVisit(propertyId, when, slot.label);
              refresh();
              onClose();
              Alert.alert(
                visit ? "Visit rescheduled" : "Visit booked",
                `${propertyLabel}\n${whenLabel}`
              );
            } catch (e: any) {
              Alert.alert(visit ? "Couldn't reschedule" : "Couldn't book", e?.message ?? "Please try again.");
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: colors.surfaceAlt,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            maxHeight: "90%",
            paddingTop: 16,
            paddingBottom: Math.max(insets.bottom, 12) + 8,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 20, gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: T.subhead.fontSize, fontWeight: "700", color: colors.ink, letterSpacing: -0.4 }}>
                {visit ? "Reschedule visit" : "Book a site visit"}
              </Text>
              <Text style={{ color: colors.inkFaint, fontSize: 13, marginTop: 2 }} numberOfLines={2}>
                {propertyLabel}
                {visit?.visit_ref ? ` · ${visit.visit_ref}` : ""}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={{ padding: 4 }}>
              <Text style={{ color: colors.inkSoft, fontWeight: "600", fontSize: 15 }}>Close</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 20, paddingTop: 14 }}
            showsVerticalScrollIndicator={false}
          >
            <Text style={{ fontWeight: "600", color: colors.inkSoft, fontSize: 13, marginBottom: 8 }}>Pick a day</Text>
            <MonthCalendar selected={day} onSelect={setDay} minDate={minDate} maxDate={maxDate} />

            <Text style={{ fontWeight: "600", color: colors.inkSoft, fontSize: 13, marginTop: 18, marginBottom: 8 }}>Time</Text>
            {slotsLoading ? (
              <ActivityIndicator color={colors.brand} />
            ) : slots.length === 0 ? (
              <Text style={{ color: colors.inkFaint, fontSize: 13 }}>
                No visiting hours are published right now. Please contact us to arrange a time.
              </Text>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {slots.map((s) => {
                  const on = s.id === slot?.id;
                  return (
                    <Pressable
                      key={s.id}
                      onPress={() => setSlotId(s.id)}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        borderRadius: 999,
                        backgroundColor: on ? colors.brand : colors.surface,
                        borderWidth: 1,
                        borderColor: on ? colors.brand : colors.border,
                      }}
                    >
                      <Text style={{ color: on ? "#fff" : colors.inkSoft, fontWeight: "700", fontSize: 13 }}>{s.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginTop: 20,
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderRadius: 16,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ color: colors.inkFaint, fontSize: 13 }}>Your visit</Text>
              <Text style={{ color: colors.ink, fontWeight: "700", fontSize: 14, flexShrink: 1, textAlign: "right" }}>
                {whenLabel}
              </Text>
            </View>

            <Button
              label={visit ? "Confirm new time" : "Confirm visit"}
              onPress={submit}
              loading={busy}
              disabled={!slot}
              style={{ marginTop: space.md }}
            />

            <Text style={{ color: colors.inkFaint, fontSize: 12, textAlign: "center", marginTop: 12, lineHeight: 18 }}>
              Free site visit · no obligation. You can reschedule or cancel any time from
              Account → My site visits.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
