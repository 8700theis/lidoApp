import { Redirect } from "expo-router";
import { useSession } from "../hooks/useSession";
import * as Linking from "expo-linking";
import { useState } from "react";
import { View, TextInput, Button, Alert } from "react-native";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
    const { session, loading } = useSession();
    if (!loading && session) return <Redirect href="/(tabs)" />;

  const sendLink = async () => {
  const redirectTo = Linking.createURL("login");

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
    },
  });

  if (error) {
    Alert.alert("Fejl", error.message);
  } else {
    Alert.alert("Sendt", "Tjek din mail 📩");
  }
};


  return (
    <View style={{ padding: 20, gap: 12 }}>
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={{ borderWidth: 1, padding: 12, borderRadius: 8 }}
      />
      <Button title="Send magic link" onPress={sendLink} />
    </View>
  );
}
