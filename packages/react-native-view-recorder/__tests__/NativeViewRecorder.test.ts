describe("NativeViewRecorder", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("calls TurboModuleRegistry.get with 'ViewRecorder'", () => {
    const { TurboModuleRegistry } = require("react-native");

    require("../src/NativeViewRecorder");

    expect(TurboModuleRegistry.get).toHaveBeenCalledWith("ViewRecorder");
  });

  test("exports null when TurboModuleRegistry.get returns null", () => {
    const { TurboModuleRegistry } = require("react-native");
    TurboModuleRegistry.get.mockReturnValueOnce(null);

    const mod = require("../src/NativeViewRecorder");

    expect(mod.default).toBeNull();
  });

  test("exports the module when TurboModuleRegistry.get returns it", () => {
    const { TurboModuleRegistry } = require("react-native");
    const fakeModule = { startSession: jest.fn() };
    TurboModuleRegistry.get.mockReturnValueOnce(fakeModule);

    const mod = require("../src/NativeViewRecorder");

    expect(mod.default).toBe(fakeModule);
  });
});
