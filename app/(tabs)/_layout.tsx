import { Tabs, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { JamindarFab } from "@/components/Jamindar";
import { TabBar } from "@/components/TabBar";

export default function TabsLayout() {
  // Audit 29-07 (#16): the Jamindar tab mounts its own sheet — showing the mic
  // FAB there put a second entry point to a second copy of the same sheet.
  const pathname = usePathname();
  const onAssistantTab = pathname?.includes("assistant");
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBar={(props) => <TabBar {...props} />}
        screenOptions={{ headerShown: false }}
        // Bug 28-07: Back should walk through the tabs actually visited
        // (Account → Jamindar → Back = Account), not jump straight to Home.
        backBehavior="history"
      >
        <Tabs.Screen
          name="home"
          options={{
            title: "Home",
            tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="properties"
          options={{
            title: "Properties",
            tabBarIcon: ({ color, size }) => <Ionicons name="business" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="assistant"
          options={{
            title: "Jamindar",
            tabBarIcon: ({ color, size }) => <Ionicons name="sparkles" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="account"
          options={{
            title: "Account",
            tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
          }}
        />
      </Tabs>
      {/* clears the floating tab bar (≈71pt tall + its 13pt bottom margin) */}
      {onAssistantTab ? null : <JamindarFab bottomOffset={92} />}
    </View>
  );
}
