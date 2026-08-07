import { useEffect, useState } from "react";
import { Image, Text, View, ScrollView, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, Redirect } from "expo-router";
import { Button } from "@/components/ui";
import { useAuth } from "@/lib/store";
import { colors, space, type as T } from "@/lib/theme";

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Bug 28-07: no scrolling when everything already fits the screen.
  //
  // Bug report 18 — it still scrolled. The measurement was right; the layout
  // was the problem. Everything below the mascot is fixed copy, so a mascot
  // pinned at 236pt pushed the total a few pixels past a shorter viewport, and
  // a few pixels is all it takes to make the screen drag. Sizing the mascot
  // from the window instead lets the content fit on any phone, so the branch
  // below almost always resolves to "no scroll" — and when a very short or
  // heavily font-scaled screen genuinely does overflow, it still scrolls
  // rather than hiding the button. The tolerance is a few pixels rather than
  // one, so sub-pixel rounding at 2.75x density cannot flip it on its own.
  //
  // Bug report 07-08 #8 — it STILL dragged. Sizing the mascot from the window
  // is a guess: 27% of the height happens to fit most phones and misses some
  // by a handful of points, and a handful of points is all it takes. So stop
  // guessing and measure. When the content comes back taller than the
  // viewport, trim the mascot by exactly the overflow; the card below it has
  // flexGrow:1 and soaks the reclaimed space up, so the next pass measures
  // content === viewport and the loop settles after one step. Monotonic and
  // clamped, so it cannot oscillate: `trim` only ever grows, and never past
  // MASCOT_MIN. If a genuinely tiny screen still overflows at the smallest
  // mascot, scrollNeeded stays true and the button remains reachable.
  const { height: winH } = useWindowDimensions();
  const MASCOT_MIN = 112;
  const mascotBase = Math.max(150, Math.min(236, Math.round(winH * 0.27)));
  const [trim, setTrim] = useState(0);
  const mascot = Math.max(MASCOT_MIN, mascotBase - trim);
  const [contentH, setContentH] = useState(0);
  const [viewH, setViewH] = useState(0);

  // A rotation or a fold changes the window, which changes the base size — let
  // the mascot grow back and re-measure from scratch.
  useEffect(() => { setTrim(0); }, [winH]);

  useEffect(() => {
    if (contentH <= 0 || viewH <= 0) return;
    const over = contentH - viewH;
    if (over <= 2) return;
    setTrim((t) => Math.min(Math.max(0, mascotBase - MASCOT_MIN), t + over));
  }, [contentH, viewH, mascotBase]);

  // ⚠️ Default to SCROLLABLE and only lock once both measurements have actually
  // arrived. Locking by default looks identical most of the time and is a trap
  // the rest: if onLayout/onContentSizeChange do not fire — which is exactly
  // what happens on the web build — the heights stay 0, the screen locks, and
  // "Get Started" ends up below the fold with no way to reach it. Verified in
  // the browser: the button sat at y=1006 in an 812pt viewport behind
  // overflow:hidden. Unmeasured must therefore mean "scroll", the safe state.
  const measured = contentH > 0 && viewH > 0;
  const scrollNeeded = !measured || contentH > viewH + 4;

  // Returning-user safety net: if a stored session finishes restoring while
  // this screen is up, skip straight back into the app — no fresh OTP.
  const profile = useAuth((s) => s.profile);
  if (profile?.is_profile_complete) return <Redirect href="/(tabs)/home" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        scrollEnabled={scrollNeeded}
        onContentSizeChange={(_, h) => setContentH(h)}
        onLayout={(e) => setViewH(e.nativeEvent.layout.height)}
      >
        {/* mascot on white — larger, occupies the golden top section */}
        <SafeAreaView edges={["top"]} style={{ alignItems: "center", paddingTop: space.md }}>
          <Image
            source={require("../assets/namaste.jpg")}
            style={{ width: mascot, height: mascot, resizeMode: "contain" }}
          />
        </SafeAreaView>

        {/* card */}
        <View
          style={{
            flexGrow: 1,
            backgroundColor: colors.surfaceAlt,
            borderTopLeftRadius: space.lg,
            borderTopRightRadius: space.lg,
            marginTop: space.xxs,
            paddingHorizontal: space.lg,
            paddingTop: space.lg,
            paddingBottom: Math.max(insets.bottom, space.sm) + space.md,
            alignItems: "center",
          }}
        >
          {/* original Jamin logo on a crisp white badge */}
          <View
            style={{
              width: "82%",
              backgroundColor: "#FFFFFF",
              borderRadius: space.md,
              paddingVertical: space.sm,
              paddingHorizontal: space.md,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
            }}
          >
            <Image
              source={require("../assets/logo-badge.png")}
              style={{ width: "100%", height: undefined, aspectRatio: 1095 / 439, resizeMode: "contain" }}
            />
          </View>

          {/* The emoji is a sibling, not part of the letter-spaced string:
              letterSpacing applied across the whole line let 🙏 wrap onto its
              own row on narrow screens, and the trailing space after the last
              character pushed the centred text off-axis. */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: space.lg }}>
            <Text
              numberOfLines={1}
              style={{ letterSpacing: 4, color: colors.inkSoft, fontSize: T.small.fontSize, fontWeight: "600" }}
            >
              N A M A S T E
            </Text>
            <Text style={{ fontSize: T.small.fontSize, marginLeft: 2 }}>🙏</Text>
          </View>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ fontSize: T.title.fontSize, lineHeight: T.title.lineHeight, fontWeight: "800", color: colors.ink, marginTop: space.xs, alignSelf: "stretch", textAlign: "center" }}
          >
            Welcome to Jamin Bazaar
          </Text>
          <Text style={{ color: colors.inkFaint, marginTop: space.sm, textAlign: "center", fontSize: T.body.fontSize, lineHeight: T.body.lineHeight, paddingHorizontal: space.xs }}>
            I'm Jamindar, your AI property advisor. I'll help you find the right plot, villa, farm land or home —
            in your language, by voice or text.
          </Text>

          <Button
            label="Get Started"
            onPress={() => router.push("/login")}
            // explicit width, not alignSelf: a centred parent was leaving the
            // pill hugging its label
            style={{ marginTop: space.lg, width: "100%" }}
          />
          <Text style={{ color: colors.inkFaint, fontSize: T.small.fontSize, lineHeight: T.small.lineHeight, textAlign: "center", marginTop: space.sm }}>
            Sign in with your mobile number — no passwords, ever.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
