import { useSession } from "../hooks/useSession";
import { useRouter } from "expo-router";
import { Stack } from "expo-router";
import { useEffect } from "react";
import {
  Platform,
} from "react-native";
import * as Linking from "expo-linking";
import { registerForPushNotificationsAsync } from "../lib/push";
import { supabase } from "../lib/supabase";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  const { session } = useSession();
  const router = useRouter();
  const COLORS = {
    bg: "#0B0F14",
    accent: "#F5C542",
    textSoft: "#B7C0C8",
  };

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

  useEffect(() => {
    const syncAccessAndProfile = async () => {
      if (!session?.user?.id || !session?.user?.email) return;

      const email = session.user.email.toLowerCase();

      const { data, error } = await supabase
        .from("allowed_users")
        .select("email,name,role,is_admin")
        .eq("email", email)
        .maybeSingle();

      if (error) {
        console.log("whitelist/profile sync error:", error.message);
        return;
      }

      if (!data) {
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      const { error: profileUpsertError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: session.user.id,
            name: data.name ?? null,
            role: data.role ?? "spiller",
            is_admin: !!data.is_admin,
          },
          { onConflict: "id" }
        );

      if (profileUpsertError) {
        console.log("profile upsert error:", profileUpsertError.message);
      }
    };

    syncAccessAndProfile();
  }, [session?.user?.id, session?.user?.email]);

  useEffect(() => {
    const savePushToken = async () => {
      if (!session?.user?.id || !session?.user?.email) return;

      try {
        const token = await registerForPushNotificationsAsync();
        if (!token) return;

        const email = session.user.email.toLowerCase();

        const { error } = await supabase
          .from("device_push_tokens")
          .upsert(
            {
              user_id: session.user.id,
              user_email: email,
              expo_push_token: token,
              platform: Platform.OS,
              is_active: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "expo_push_token" }
          );

        if (error) {
          console.log("savePushToken error:", error.message);
        }
      } catch (e) {
        console.log("push registration error:", e);
      }
    };

    savePushToken();
  }, [session?.user?.id, session?.user?.email]);

  return (
    
    <Stack screenOptions={{ headerShown: false }}>
      <StatusBar style="light" />
      {/* Main app */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

      {/* Profile modal */}
      <Stack.Screen
        name="(modals)/profile"
        options={{
          presentation: "transparentModal",
          headerShown: false,
          contentStyle: { backgroundColor: "transparent", },
        }}
      />
    </Stack>
  );
}
