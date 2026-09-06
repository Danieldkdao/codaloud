import { CodeText, HeadingText, PText } from "@/components/text";
import { View } from "react-native";

const Index = () => {
  return (
    <View className="flex-1 items-center justify-center">
      <HeadingText className="text-lg">Hello, Codaloud!</HeadingText>
      <PText className="text-lg">Hello, Codaloud!</PText>
      <CodeText className="text-lg">Hello, Codaloud!</CodeText>
    </View>
  );
};

export default Index;
