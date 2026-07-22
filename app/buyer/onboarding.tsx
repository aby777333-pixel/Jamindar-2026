import { useEffect, useState } from "react";
import { Text, View, ScrollView, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/ui";
import { Field } from "@/components/Field";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/store";
import { colors } from "@/lib/theme";
import { PROPERTY_TYPE_LABELS, type PropertyType } from "@/lib/types";

const PROPERTY_TYPES = Object.keys(PROPERTY_TYPE_LABELS) as PropertyType[];
const PURPOSES = ["Self use", "Investment", "Rental income", "Future construction", "Agriculture", "Commercial development"];
const TIMEFRAMES = ["Immediately", "Within 1 month", "Within 3 months", "Within 6 months", "Just exploring"];
const FINANCING = ["Cash", "Bank Loan", "Partial Finance"];
const AMENITIES = ["Gated Community", "Corner Plot", "Park Facing", "Main Road", "Lake View", "Metro Nearby", "School Nearby", "Hospital Nearby", "Temple Nearby", "Highway Access", "Water Supply", "Electricity"];
const VASTU = ["East Facing", "North Facing", "Corner Plot", "DTCP Approved", "CMDA Approved", "RERA Approved"];
const AREA_UNITS = ["sqft", "grounds", "acres", "hectares"];

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

export default function BuyerOnboarding() {
  const router = useRouter();
  const { profile } = useAuth();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  const [types, setTypes] = useState<PropertyType[]>([]);
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [city, setCity] = useState(profile?.city ?? "");
  const [stateName, setStateName] = useState(profile?.state ?? "");
  const [areaMin, setAreaMin] = useState("");
  const [areaMax, setAreaMax] = useState("");
  const [areaUnit, setAreaUnit] = useState("sqft");
  const [purpose, setPurpose] = useState<string[]>([]);
  const [timeframe, setTimeframe] = useState("");
  const [financing, setFinancing] = useState("");
  const [amenities, setAmenities] = useState<string[]>([]);
  const [vastu, setVastu] = useState<string[]>([]);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from("buyer_preferences")
      .select("*")
      .eq("buyer_id", profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setTypes(data.property_types ?? []);
        setBudgetMin(data.budget_min?.toString() ?? "");
        setBudgetMax(data.budget_max?.toString() ?? "");
        setCity(data.city ?? profile.city ?? "");
        setStateName(data.state ?? profile.state ?? "");
        setAreaMin(data.area_min?.toString() ?? "");
        setAreaMax(data.area_max?.toString() ?? "");
        setAreaUnit(data.area_unit ?? "sqft");
        setPurpose(data.purpose ?? []);
        setTimeframe(data.timeframe ?? "");
        setFinancing(data.financing ?? "");
        setAmenities(data.amenities ?? []);
        setVastu(data.vastu ?? []);
      });
  }, [profile?.id]);

  const steps = ["Intent", "Budget", "Location", "Size", "Purpose", "Amenities"];

  async function save() {
    if (!profile) return;
    setLoading(true);
    try {
      const { error } = await supabase.from("buyer_preferences").upsert(
        {
          buyer_id: profile.id,
          property_types: types,
          budget_min: budgetMin ? Number(budgetMin) : null,
          budget_max: budgetMax ? Number(budgetMax) : null,
          city: city.trim() || null,
          state: stateName.trim() || null,
          area_min: areaMin ? Number(areaMin) : null,
          area_max: areaMax ? Number(areaMax) : null,
          area_unit: areaUnit,
          purpose,
          timeframe: timeframe || null,
          financing: financing || null,
          amenities,
          vastu,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "buyer_id" }
      );
      if (error) throw error;
      Alert.alert("Preferences saved", "Jamindar will use these to match you with the right properties.", [
        { text: "See Properties", onPress: () => router.replace("/(tabs)/properties") },
        { text: "Home", onPress: () => router.replace("/(tabs)/home") },
      ]);
    } catch (e: any) {
      Alert.alert("Couldn't save", e?.message ?? "");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      {/* progress */}
      <View style={{ flexDirection: "row", alignItems: "center", padding: 20, gap: 10 }}>
        <Pressable onPress={() => (step === 0 ? router.back() : setStep((s) => s - 1))}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1, height: 6, backgroundColor: colors.surfaceSunken, borderRadius: 3 }}>
          <View style={{ width: `${((step + 1) / steps.length) * 100}%`, height: 6, backgroundColor: colors.brand, borderRadius: 3 }} />
        </View>
        <Text style={{ color: colors.inkFaint, fontSize: 12 }}>
          {step + 1}/{steps.length}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {step === 0 && (
          <StepBlock title="What are you looking for?" subtitle="Select all that apply.">
            <Wrap options={PROPERTY_TYPES.map((t) => ({ key: t, label: PROPERTY_TYPE_LABELS[t] }))} selected={types} onToggle={(k) => setTypes((a) => toggle(a, k as PropertyType))} />
          </StepBlock>
        )}
        {step === 1 && (
          <StepBlock title="Your budget" subtitle="Enter an approximate range in ₹.">
            <Field label="Minimum (₹)" value={budgetMin} onChangeText={setBudgetMin} keyboardType="numeric" placeholder="2000000" />
            <Field label="Maximum (₹)" value={budgetMax} onChangeText={setBudgetMax} keyboardType="numeric" placeholder="5000000" />
          </StepBlock>
        )}
        {step === 2 && (
          <StepBlock title="Preferred location" subtitle="Where would you like to invest?">
            <Field label="City" value={city} onChangeText={setCity} placeholder="Chennai" />
            <Field label="State" value={stateName} onChangeText={setStateName} placeholder="Tamil Nadu" />
          </StepBlock>
        )}
        {step === 3 && (
          <StepBlock title="Plot size" subtitle="Choose a unit and range.">
            <Wrap options={AREA_UNITS.map((u) => ({ key: u, label: u }))} selected={[areaUnit]} onToggle={(k) => setAreaUnit(k)} />
            <View style={{ height: 12 }} />
            <Field label="Minimum area" value={areaMin} onChangeText={setAreaMin} keyboardType="numeric" placeholder="600" />
            <Field label="Maximum area" value={areaMax} onChangeText={setAreaMax} keyboardType="numeric" placeholder="2400" />
          </StepBlock>
        )}
        {step === 4 && (
          <StepBlock title="Purpose & plan" subtitle="Tell us why and when.">
            <Text style={label}>Purpose</Text>
            <Wrap options={PURPOSES.map((p) => ({ key: p, label: p }))} selected={purpose} onToggle={(k) => setPurpose((a) => toggle(a, k))} />
            <Text style={[label, { marginTop: 16 }]}>Timeframe</Text>
            <Wrap options={TIMEFRAMES.map((p) => ({ key: p, label: p }))} selected={[timeframe]} onToggle={(k) => setTimeframe(k)} />
            <Text style={[label, { marginTop: 16 }]}>Financing</Text>
            <Wrap options={FINANCING.map((p) => ({ key: p, label: p }))} selected={[financing]} onToggle={(k) => setFinancing(k)} />
          </StepBlock>
        )}
        {step === 5 && (
          <StepBlock title="Amenities & preferences" subtitle="Pick what matters to you.">
            <Text style={label}>Amenities</Text>
            <Wrap options={AMENITIES.map((p) => ({ key: p, label: p }))} selected={amenities} onToggle={(k) => setAmenities((a) => toggle(a, k))} />
            <Text style={[label, { marginTop: 16 }]}>Vastu & approvals</Text>
            <Wrap options={VASTU.map((p) => ({ key: p, label: p }))} selected={vastu} onToggle={(k) => setVastu((a) => toggle(a, k))} />
          </StepBlock>
        )}
      </ScrollView>

      <View style={{ padding: 20, paddingBottom: 30 }}>
        {step < steps.length - 1 ? (
          <Button label="Next" onPress={() => setStep((s) => s + 1)} />
        ) : (
          <Button label="Save preferences" onPress={save} loading={loading} />
        )}
      </View>
    </SafeAreaView>
  );
}

const label = { color: colors.inkSoft, fontWeight: "600" as const, marginBottom: 8, fontSize: 13 };

function StepBlock({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={{ fontSize: 24, fontWeight: "800", color: colors.ink }}>{title}</Text>
      {subtitle ? <Text style={{ color: colors.inkFaint, marginTop: 6, marginBottom: 18 }}>{subtitle}</Text> : <View style={{ height: 12 }} />}
      {children}
    </View>
  );
}

function Wrap({
  options,
  selected,
  onToggle,
}: {
  options: { key: string; label: string }[];
  selected: string[];
  onToggle: (k: string) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {options.map((o) => {
        const active = selected.includes(o.key);
        return (
          <Pressable
            key={o.key}
            onPress={() => onToggle(o.key)}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 11,
              borderRadius: 12,
              backgroundColor: active ? colors.brand : colors.surface,
              borderWidth: 1.5,
              borderColor: active ? colors.brand : colors.border,
            }}
          >
            <Text style={{ color: active ? "#fff" : colors.inkSoft, fontWeight: "600" }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
