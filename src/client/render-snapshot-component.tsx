import { createRoot, Root } from "react-dom/client";
import React from "react";

const EXPOSE_FUNCTION_NAME = "__PLAYWRIGHT_REACT__";
const playwrightBridge = window[EXPOSE_FUNCTION_NAME];

declare global {
  interface Window {
    [EXPOSE_FUNCTION_NAME]: ((...args: any[]) => Promise<void>) & {
      run?: () => Promise<void>;
    };
  }
}

export interface SnapshotTest {
  name?: string;
  render?(): JSX.Element;
  viewportSize?: { width: number; height: number };
  waitTime?: number;
  waitForFunc?: () => Promise<void>;
}

async function executeTest(
  cb: (Component: () => JSX.Element) => JSX.Element
): Promise<void> {
  const tests = await getTests();
  const rootNode = getRootNode();
  const root = createRoot(rootNode);

  for (const test of tests) {
    assertTest(test);
    if (test.viewportSize) {
      await playwrightBridge("setViewportSize", test.viewportSize);
    }
    await asyncRender(
      cb(() => test.render()),
      root
    );
    if (test.waitTime) {
      await new Promise((res) => setTimeout(res, test.waitTime));
    }
    if (test.waitForFunc) {
      await test.waitForFunc();
    }
    await playwrightBridge("snapshot", test.name);
    root.unmount();
  }
}

function asyncRender(
  element: React.FunctionComponentElement<unknown>,
  root: Root
): Promise<void> {
  return new Promise<void>((resolve, reject): void => {
    try {
      root.render(
        <div
          className="playwright_react_component_wrapper"
          style={{ display: "inline-block" }}
        >
          {element}
        </div>
      );

      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

async function renderAllSnapshots(
  cb: (Component: () => JSX.Element) => JSX.Element
) {
  const tests = await getTests();
  const styling = {
    fieldset: { marginBottom: 50 },
    legend: {
      backgroundColor: "#000",
      color: "#fff",
      padding: "3px 6px",
      font: "1rem 'Fira Sans', sans-serif",
    },
    wrapper: { margin: 20 },
  };
  const testComponents = tests.map((test, key) => {
    assertTest(test);
    return (
      <fieldset style={styling.fieldset} key={key}>
        <legend style={styling.legend}>{test.name}</legend>
        <div style={styling.wrapper}>{cb(() => test.render())}</div>
      </fieldset>
    );
  });

  const root = createRoot(getRootNode());
  root.render(testComponents);
}

function assertTest(
  test: SnapshotTest
): asserts test is Required<SnapshotTest> {
  if (!test || !test.name || !test.render) {
    throw new Error(`Snapshot test most inclode both "name" and "render"`);
  }
}

function getRootNode(): HTMLElement {
  const rootNode = document.getElementById("app");
  if (!rootNode) {
    throw new Error('Can not found element with id "app"');
  }
  return rootNode;
}

function getTests(): Promise<SnapshotTest[]> {
  const testPath = new URL(document.location.href).searchParams.get("test");
  if (!testPath) {
    throw new Error(
      `"test" param is missing. You need to add a path to a test in the url. eg. "?test=my/path/Test.tsx"`
    );
  }
  return import(/* @vite-ignore */ testPath).then((m) => m.tests);
}

export function mountAndTakeSnapshot(
  cb: (Component: () => JSX.Element) => JSX.Element
): void {
  if (!playwrightBridge) {
    // We are not running in playwright
    renderAllSnapshots(cb);
  } else {
    playwrightBridge.run = (): Promise<void> => executeTest(cb);
  }
}
