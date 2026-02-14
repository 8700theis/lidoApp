import { View, Button } from "react-native";
import { supabase } from "../../lib/supabase";

export default function TabHome() {
  const logout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <View style={{ padding: 20 }}>
      <Button title="Log ud" onPress={logout} />
    </View>
  );
}
