export const creditsForTopup = (productId: string): number | null => {
  switch (productId) {
    case "codaloud.credits.100":
      return 100;
    case "codaloud.credits.200":
      return 200;
    case "codaloud.credits.500":
      return 500;
    case "codaloud.credits.1000":
      return 1000;
    default:
      return null;
  }
};
