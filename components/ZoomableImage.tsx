import { useEffect } from "react";
import { Image } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

const MAX_SCALE = 6;

/**
 * One pinch-zoomable, pannable, double-tappable page of a photo gallery.
 *
 * Split out of the single-image {@link ZoomableImageViewer} so a *paging*
 * viewer can zoom too (bug report 17: full screen supported no gestures at
 * all). The gesture maths is deliberately identical to that component's.
 *
 * The parent owns the horizontal pager, so this reports zoom state back via
 * `onZoomChange`: the pager must stop swiping between photos while one is
 * zoomed in, or a drag to pan the image would flick to the next photo instead.
 * It also resets itself whenever it stops being the visible page, so returning
 * to a photo never finds it still magnified from last time.
 */
export function ZoomableImage({
  uri,
  width,
  height,
  isActive,
  onZoomChange,
}: {
  uri: string;
  width: number;
  height: number;
  isActive: boolean;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  function reset() {
    scale.value = withTiming(1);
    savedScale.value = 1;
    tx.value = withTiming(0);
    ty.value = withTiming(0);
    savedTx.value = 0;
    savedTy.value = 0;
  }

  // Swiping away from a zoomed photo must hand the pager back its gestures.
  useEffect(() => {
    if (!isActive) {
      reset();
      onZoomChange(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(savedScale.value * e.scale, 1), MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1) {
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedTx.value = 0;
        savedTy.value = 0;
        runOnJS(onZoomChange)(false);
      } else {
        runOnJS(onZoomChange)(true);
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value <= 1) return; // fits the screen — let the pager have it
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
        runOnJS(onZoomChange)(false);
      } else {
        scale.value = withTiming(2.5);
        savedScale.value = 2.5;
        runOnJS(onZoomChange)(true);
      }
    });

  // double tap must win over pan; pinch and pan run together
  const gesture = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ width, height, alignItems: "center", justifyContent: "center" }, style]}>
        <Image source={{ uri }} style={{ width, height }} resizeMode="contain" />
      </Animated.View>
    </GestureDetector>
  );
}
