import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs, router } from "expo-router";
import { useSession } from "../../hooks/useSession";
import React from "react";
import { Pressable, Text } from "react-native";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { session, loading } = useSession();
  if (!loading && !session) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        headerShown: true,
        tabBarButton: HapticTab,
        headerRight: () => (
          <Pressable
            onPress={() => router.push("/(modals)/profile")}
            style={{ marginRight: 15, padding: 6 }}
          >
            <Ionicons name="person-circle" size={28} color="#111" />
          </Pressable>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="house.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="paperplane.fill" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
