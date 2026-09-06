import { MainTabBar } from "@/components/main-tab-bar";
import { TabList, TabSlot, Tabs, TabTrigger } from "expo-router/ui";
import { View } from "react-native";

const MainLayout = () => (
  <Tabs asChild options={{ backBehavior: "initialRoute" }}>
    <View className="flex-1 bg-background">
      <TabSlot style={{ flex: 1 }} />
      <TabList style={{ display: "none" }}>
        <TabTrigger name="projects" href="/(main)" />
        <TabTrigger name="drafts" href="/(main)/drafts" />
        <TabTrigger name="account" href="/(main)/account" />
      </TabList>
      <MainTabBar />
    </View>
  </Tabs>
);

export default MainLayout;
