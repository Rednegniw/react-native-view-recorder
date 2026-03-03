/**
 * Mock React hooks as pass-through functions so hooks can be called as plain functions
 * without needing a React renderer.
 */
jest.mock("react", () => ({
  useRef: (init) => ({ current: init }),
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  forwardRef: (render) => render,
}));

// Mock react-native: TurboModuleRegistry, findNodeHandle, codegenNativeComponent
jest.mock("react-native", () => ({
  TurboModuleRegistry: {
    get: jest.fn(() => null),
  },
  findNodeHandle: jest.fn(() => null),
  codegenNativeComponent: (name) => name,
}));

// requestAnimationFrame does not exist in Node; provide a synchronous mock.
globalThis.requestAnimationFrame = (cb) => {
  cb(Date.now());
  return 0;
};
