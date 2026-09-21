import { Image } from "@/components/ui/image";

export const GoogleIcon = () => (
  <Image
    source={{ default: require("@/assets/google-g-logo.png") }}
    accessible={false}
    contentFit="contain"
    style={{ width: 20, height: 20.4 }}
  />
);
