import { useState } from "react";
import { Text, View, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/ui";
import { Field } from "@/components/Field";
import { colors } from "@/lib/theme";
import { formatINR } from "@/lib/format";
import { emi, loanEligibility, purchaseCosts, rentalYield } from "@/lib/calc";

type Tab = "emi" | "eligibility" | "costs" | "yield";
const TABS: { key: Tab; label: string }[] = [
  { key: "emi", label: "EMI" },
  { key: "eligibility", label: "Eligibility" },
  { key: "costs", label: "Purchase Cost" },
  { key: "yield", label: "Rental Yield" },
];

function num(s: string): number {
  const n = Number((s || "").replace(/[^0-9.]/g, ""));
  return isFinite(n) ? n : 0;
}

export default function Calculators() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("emi");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceAlt }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 8 }}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={{ fontSize: 22, fontWeight: "800", color: colors.ink }}>Calculators</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14, maxHeight: 44 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 9,
              borderRadius: 999,
              backgroundColor: tab === t.key ? colors.brand : colors.surface,
              borderWidth: 1,
              borderColor: tab === t.key ? colors.brand : colors.border,
            }}
          >
            <Text style={{ color: tab === t.key ? "#fff" : colors.inkSoft, fontWeight: "600", fontSize: 13 }}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        {tab === "emi" && <EmiCalc />}
        {tab === "eligibility" && <EligibilityCalc />}
        {tab === "costs" && <CostsCalc />}
        {tab === "yield" && <YieldCalc />}
        <Text style={{ color: colors.inkFaint, fontSize: 11, marginTop: 18, textAlign: "center" }}>
          Estimates for guidance only. Stamp duty & registration vary by state — confirm before registration.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function ResultRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: 1, borderColor: colors.border }}>
      <Text style={{ color: colors.inkSoft, fontSize: bold ? 15 : 14, fontWeight: bold ? "700" : "500" }}>{label}</Text>
      <Text style={{ color: bold ? colors.brand : colors.ink, fontSize: bold ? 16 : 14, fontWeight: bold ? "800" : "600" }}>{value}</Text>
    </View>
  );
}

function EmiCalc() {
  const [p, setP] = useState("3000000");
  const [rate, setRate] = useState("8.5");
  const [years, setYears] = useState("20");
  const r = emi(num(p), num(rate), num(years) * 12);
  return (
    <Card>
      <Field label="Loan amount (₹)" value={p} onChangeText={setP} keyboardType="numeric" />
      <Field label="Interest rate (% p.a.)" value={rate} onChangeText={setRate} keyboardType="numeric" />
      <Field label="Tenure (years)" value={years} onChangeText={setYears} keyboardType="numeric" />
      <ResultRow label="Monthly EMI" value={formatINR(r.emi)} bold />
      <ResultRow label="Total interest" value={formatINR(r.totalInterest)} />
      <ResultRow label="Total payment" value={formatINR(r.totalPayment)} />
    </Card>
  );
}

function EligibilityCalc() {
  const [budget, setBudget] = useState("30000");
  const [rate, setRate] = useState("8.5");
  const [years, setYears] = useState("20");
  const max = loanEligibility(num(budget), num(rate), num(years) * 12);
  return (
    <Card>
      <Field label="Max monthly EMI you can pay (₹)" value={budget} onChangeText={setBudget} keyboardType="numeric" />
      <Field label="Interest rate (% p.a.)" value={rate} onChangeText={setRate} keyboardType="numeric" />
      <Field label="Tenure (years)" value={years} onChangeText={setYears} keyboardType="numeric" />
      <ResultRow label="Approx. loan you can avail" value={formatINR(max)} bold />
    </Card>
  );
}

function CostsCalc() {
  const [price, setPrice] = useState("3500000");
  const c = purchaseCosts(num(price));
  return (
    <Card>
      <Field label="Property price (₹)" value={price} onChangeText={setPrice} keyboardType="numeric" />
      <ResultRow label="Stamp duty (~7%)" value={formatINR(c.stampDuty)} />
      <ResultRow label="Registration (~1%)" value={formatINR(c.registration)} />
      <ResultRow label="Legal (~0.5%)" value={formatINR(c.legal)} />
      <ResultRow label="Total cost" value={formatINR(c.total)} bold />
      <ResultRow label="Down payment (~20%)" value={formatINR(c.downPayment)} />
      <ResultRow label="Loan needed" value={formatINR(c.loanAmount)} />
    </Card>
  );
}

function YieldCalc() {
  const [rent, setRent] = useState("20000");
  const [pv, setPv] = useState("6800000");
  const y = rentalYield(num(rent) * 12, num(pv));
  return (
    <Card>
      <Field label="Monthly rent (₹)" value={rent} onChangeText={setRent} keyboardType="numeric" />
      <Field label="Property value (₹)" value={pv} onChangeText={setPv} keyboardType="numeric" />
      <ResultRow label="Annual rental yield" value={`${y}%`} bold />
    </Card>
  );
}
