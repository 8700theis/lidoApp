// app/(tabs)/index.tsx
import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "../../hooks/useSession";

const COLORS = {
  bg: "#0B0F14",
  text: "#F2F5F7",
  textSoft: "#B7C0C8",
  accent: "#F5C542",
};

export default function TabHome() {
  const { session } = useSession();
  const email = session?.user?.email ?? "";

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.inner} edges={["top", "left", "right"]}>
        <Text style={styles.title}>
          Hej{email ? `, ${email}` : ""} 👋
        </Text>
        <Text style={styles.subtitle}>
          Her kommer dit overblik over kommende kampe, klarmeldinger og
          klubnyheder til at ligge.
        </Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  title: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 8,
  },
  subtitle: {
    color: COLORS.textSoft,
    fontSize: 14,
  },
});