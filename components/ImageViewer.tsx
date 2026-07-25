import { useEffect } from "react";
import { Modal, Pressable, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import * as ScreenOrientation from "expo-screen-orientation";
import { colors } from "@/lib/theme";

const MAX_SCALE = 6;

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
  const { width, height } = useWindowDimensions();

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
          <GestureDetector gesture={gesture}>
            <Animated.View style={[{ width, height, alignItems: "center", justifyContent: "center" }, imageStyle]}>
              {uri ? (
                <Image source={{ uri }} style={{ width, height }} resizeMode="contain" />
              ) : null}
            </Animated.View>
          </GestureDetector>

          <SafeAreaView
            edges={["top"]}
            style={{ position: "absolute", top: 0, left: 0, right: 0 }}
            pointerEvents="box-none"
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingHorizontal: 20,
                paddingTop: insets.top > 0 ? 4 : 12,
              }}
            >
              <Text style={{ flex: 1, color: "rgba(255,255,255,0.9)", fontSize: 14, fontWeight: "700" }} numberOfLines={1}>
                {title ?? "Layout plan"}
              </Text>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                style={{ backgroundColor: "rgba(255,255,255,0.16)", borderRadius: 22, padding: 9 }}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </Pressable>
            </View>
          </SafeAreaView>

          <View style={{ position: "absolute", bottom: Math.max(insets.bottom, 12) + 8, left: 0, right: 0, alignItems: "center" }}>
            <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
              Pinch to zoom · double-tap · drag to move
            </Text>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
