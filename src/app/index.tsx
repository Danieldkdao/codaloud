import { Text, View } from "react-native";

const Index = () => {
  return (
    <View className="flex-1 items-center justify-center">
      <Text className="bg-red-500 text-lg font-heading font-bold">
        Hello, Codaloud!
      </Text>
      <Text className="bg-red-500 text-lg font-sans font-bold">
        Hello, Codaloud!
      </Text>
      <Text className="bg-red-500 text-lg font-mono font-bold">
        Hello, Codaloud!
      </Text>
    </View>
  );
};

export default Index;
