import { Stack } from "expo-router";
import { useEffect } from "react";
import * as Linking from "expo-linking";
import { supabase } from "../lib/supabase";

export default function RootLayout() {
  useEffect(() => {
    const handleUrl = async (url: string) => {
      const parsed = Linking.parse(url);
      const code = (parsed.queryParams?.code as string) || null;

      if (!code) {
        console.log("No code in url:", url);
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) console.log("exchangeCodeForSession error:", error.message);
    };

    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

    const sub = Linking.addEventListener("url", (event) => handleUrl(event.url));
    return () => sub.remove();
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Main app */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

      {/* Profile modal */}
      <Stack.Screen
        name="(modals)/profile"
        options={{
          presentation: "transparentModal",
          headerShown: false,
          contentStyle: { backgroundColor: "transparent" },
        }}
      />
    </Stack>
  );
}
