import { AppWrapper } from "@/components/app-wrapper";
import { Stack } from "expo-router";

const MainLayout = () => (
  <Stack
    screenLayout={({ children }) => (
      <AppWrapper scrollable={false}>{children}</AppWrapper>
    )}
    screenOptions={{ headerShown: false }}
  />
);

export default MainLayout;
