import { useEffect, useRef, useState } from "react";

// Generic hook to use a web worker for data transformation.
//
// `enabled` exists because a page that does not render the resulting chart
// should not pay for it. Hooks cannot be called conditionally, so the
// condition has to live inside: pass false and no worker is spawned at all.
export function useWorkerizedData(workerUrl, input, deps = [], enabled = true) {
  const workerRef = useRef();
  const [result, setResult] = useState(null);

  useEffect(() => {
    setResult(null);
    if (!enabled) return undefined;
    workerRef.current = new Worker(workerUrl, { type: "module" });
    const handleMessage = (e) => setResult(e.data);
    workerRef.current.addEventListener("message", handleMessage);
    workerRef.current.postMessage(input);
    return () => {
      workerRef.current?.terminate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);

  return result;
}
