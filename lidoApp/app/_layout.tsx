import { useSession } from "../hooks/useSession";
import { useRouter } from "expo-router";
import { Stack } from "expo-router";
import { useEffect } from "react";
import * as Linking from "expo-linking";
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
    const checkWhitelist = async () => {
      if (!session?.user?.email) return;

      const email = session.user.email.toLowerCase();

      const { data, error } = await supabase
        .from("allowed_users")
        .select("email")
        .eq("email", email)
        .maybeSingle();

      if (error) {
        console.log("whitelist error:", error.message);
        // fail-safe: lad brugeren blive i appen hvis vi ikke kan tjekke
        return;
      }

      if (!data) {
        // her er vi ret sikre: vi kunne læse tabellen, men der er ingen række
        await supabase.auth.signOut();
        router.replace("/login");
      }
    };

    checkWhitelist();
  }, [session?.user?.email]);


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
