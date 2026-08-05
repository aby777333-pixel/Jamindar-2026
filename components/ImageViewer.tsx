import { useEffect } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import * as ScreenOrientation from "expo-screen-orientation";

const MAX_SCALE = 6;
/** Opaque header bar — never let the controls sit on the artwork. */
const HEADER_ROW = 52;
const HEADER_BG = "#101010";

/**
 * Full-screen image viewer with pinch-zoom, pan and double-tap.
 *
 * Used for the master plan, where a buyer needs to read plot numbers and
 * dimensions off the drawing. The app is portrait-locked, so rotation is
 * unlocked only while this is open and restored on close.
 *
 * A Modal renders in its own view hierarchy, so it needs its own
 * GestureHandlerRootView — the one in app/_layout.tsx does not reach inside.
 */
export function ZoomableImageViewer({
  visible,
  uri,
  title,
  onClose,
}: {
  visible: boolean;
  uri: string | null;
  title?: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  function resetTransform() {
    scale.value = withTiming(1);
    savedScale.value = 1;
    tx.value = withTiming(0);
    ty.value = withTiming(0);
    savedTx.value = 0;
    savedTy.value = 0;
  }

  useEffect(() => {
    if (!visible) return;
    resetTransform();
    ScreenOrientation.unlockAsync().catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const next = savedScale.value * e.scale;
      scale.value = Math.min(Math.max(next, 1), MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      // snapping back to fit should also recentre, or the image drifts off-screen
      if (scale.value <= 1) {
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedTx.value = 0;
        savedTy.value = 0;
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value <= 1) return; // no panning while it fits the screen
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedTx.value = 0;
        savedTy.value = 0;
      } else {
        scale.value = withTiming(2.5);
        savedScale.value = 2.5;
      }
    });

  // double tap must win over pan, but pinch and pan run together
  const gesture = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <Modal
      visible={visible && !!uri}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={["portrait", "landscape"]}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          {/* Bug report 16: the title and Close (X) used to float ON the image.
              Over a light document (a KYC scan) white-on-white made both
              unreadable. The header is now an opaque bar and the image is boxed
              underneath it, so the two can never overlap. */}
          <View style={{ backgroundColor: HEADER_BG, paddingTop: insets.top }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingHorizontal: 20,
                height: HEADER_ROW,
              }}
            >
              <Text style={{ flex: 1, color: "#fff", fontSize: 14, fontWeight: "700" }} numberOfLines={1}>
                {title ?? "Layout plan"}
              </Text>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close preview"
                style={{ backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 22, padding: 9 }}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </Pressable>
            </View>
          </View>

          {/* overflow hidden keeps a zoomed image inside its own box */}
          <View style={{ flex: 1, overflow: "hidden" }}>
            <GestureDetector gesture={gesture}>
              <Animated.View style={[{ flex: 1, alignItems: "center", justifyContent: "center" }, imageStyle]}>
                {uri ? (
                  <Image source={{ uri }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
                ) : null}
              </Animated.View>
            </GestureDetector>

            <View style={{ position: "absolute", bottom: Math.max(insets.bottom, 12) + 8, left: 0, right: 0, alignItems: "center" }} pointerEvents="none">
              <Text
                style={{
                  color: "rgba(255,255,255,0.85)",
                  fontSize: 12,
                  backgroundColor: "rgba(0,0,0,0.55)",
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                  overflow: "hidden",
                }}
              >
                Pinch to zoom · double-tap · drag to move
              </Text>
            </View>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
