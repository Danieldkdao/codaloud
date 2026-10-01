import { Image } from "@/components/ui/image";

export const GoogleIcon = () => (
  <Image
    source={{ default: require("@/assets/google-g-logo.png") }}
    accessible={false}
    contentFit="contain"
    style={{ width: 22, height: 22.4 }}
  />
);
