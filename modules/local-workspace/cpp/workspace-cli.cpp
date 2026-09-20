#include "workspace.hpp"
#include <iostream>
#include <iterator>

int main(int argc, char **argv) {
  if (argc != 2)
    return 2;
  const std::string request(std::istreambuf_iterator<char>(std::cin), {});
  std::cout << codaloud::execute(argv[1], request);
  return 0;
}
