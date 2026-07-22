import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { JamindarFab } from "@/components/Jamindar";
import { TabBar } from "@/components/TabBar";

export default function TabsLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBar={(props) => <TabBar {...props} />}
        screenOptions={{ headerShown: false }}
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
      <JamindarFab />
    </View>
  );
}
