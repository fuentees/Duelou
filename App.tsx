import React from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import LiveApp from "./src/LiveApp";

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <LiveApp />
    </SafeAreaProvider>
  );
}
