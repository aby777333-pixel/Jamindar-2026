import { useEffect, useState } from "react";
import { AccessibilityInfo, Pressable } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

/**
 * Whether the device has asked for reduced motion.
 *
 * Owner directive 05-08 pairs "micro animations" with "high accessibility", and
 * those pull in opposite directions unless the app asks: iOS "Reduce Motion"
 * and Android "Remove animations" exist because motion makes some people
 * queasy or disoriented. Every animation added for polish is therefore gated on
 * this, and falls back to the same UI without the movement — never to a
 * different UI.
 *
 * Reads once on mount and then follows the setting live, so toggling it in
 * system settings takes effect without a restart. Any failure (older Android,
 * web) resolves to `false`, i.e. animations stay on, which is the pre-existing
 * behaviour and so cannot regress anything.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => {
        if (alive) setReduced(!!v);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", (v: boolean) => {
      if (alive) setReduced(!!v);
    });
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);

  return reduced;
}

/** Press feedback, tuned once so every surface depresses by the same amount. */
export const PRESS = {
  /** How far a card/button sinks under a finger. */
  scale: 0.972,
  /** Reanimated spring — quick, barely any overshoot; Uber/Apple-ish. */
  spring: { damping: 18, stiffness: 320, mass: 0.5 },
} as const;

/** A Pressable that can carry an animated style — no extra wrapper node, so
 *  adding press feedback cannot disturb an existing layout. */
export const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Spring press-scale for a tappable surface.
 *
 * Until now the only press feedback in the app was `android_ripple`, so iOS and
 * web users tapped a card and nothing acknowledged them. This gives every
 * surface the same small, quick depression.
 *
 * Spread `handlers` onto an {@link AnimatedPressable} and put `style` in its
 * style array. When the device asks for reduced motion the style is simply
 * omitted — same layout, same colours, no movement.
 */
export function usePressScale() {
  const reduced = useReducedMotion();
  const pressed = useSharedValue(0);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * (1 - PRESS.scale) }],
  }));

  return {
    style: reduced ? undefined : style,
    handlers: {
      onPressIn: () => {
        pressed.value = withSpring(1, PRESS.spring);
      },
      onPressOut: () => {
        pressed.value = withSpring(0, PRESS.spring);
      },
    },
  };
}
