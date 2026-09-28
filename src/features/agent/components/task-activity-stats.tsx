import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { PText } from "@/components/ui/text";
import { formatTaskActivityStats } from "../lib/formatters";

export const TaskActivityStats = ({ logs }: { logs: readonly string[] }) => {
  const stats = formatTaskActivityStats(logs);
  return (
    <View className="flex-row flex-wrap gap-x-5 gap-y-2">
      <View className="flex-row items-center gap-2">
        <Icon
          family="Feather"
          name="activity"
          size={16}
          className="text-muted-foreground"
        />
        <PText
          className="text-muted-foreground"
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {stats.actions}
        </PText>
      </View>
      <View className="flex-row items-center gap-2">
        <Icon
          family="Feather"
          name="check-circle"
          size={16}
          className="text-success-foreground"
        />
        <PText
          className="text-muted-foreground"
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {stats.completed}
        </PText>
      </View>
    </View>
  );
};
