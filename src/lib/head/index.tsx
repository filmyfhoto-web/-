import { Children, forwardRef, isValidElement, useEffect, useRef, type ReactNode } from "react";

/**
 * Minimal, dependency-free replacement for `react-helmet-async`.
 *
 * Why: react-helmet-async renders an internal function component through a
 * ref-forwarding dispatcher, which logs
 * "Warning: Function components cannot be given refs" on every page under
 * React 18 StrictMode. This implementation does the same job (title, meta,
 * link and JSON-LD script tags in <head>) with a plain effect, so the head is
 * still managed declaratively but no refs are involved.
 *
 * Semantics kept from Helmet:
 *  - <title> sets document.title
 *  - meta/link/script children are injected into <head>
 *  - a mounted Helmet replaces an existing tag with the same identity
 *    (meta[name], meta[property], link[rel]) and restores it on unmount
 *  - tags are removed when the component unmounts (route change)
 */

type AnyProps = Record<string, unknown>;

/** HelmetProvider is a no-op passthrough kept for API compatibility. */
export const HelmetProvider = forwardRef<HTMLElement, { children?: ReactNode }>(
  function HelmetProvider({ children }, _ref) {
    return <>{children}</>;
  },
);

function identityOf(tag: string, props: AnyProps): string | null {
  if (tag === "meta") {
    if (typeof props.name === "string") return `meta[name="${props.name}"]`;
    if (typeof props.property === "string") return `meta[property="${props.property}"]`;
    if (typeof props.charSet === "string") return "meta[charset]";
    return null;
  }
  if (tag === "link" && typeof props.rel === "string" && props.rel === "canonical") {
    return 'link[rel="canonical"]';
  }
  return null;
}

function textOf(children: ReactNode): string {
  return Children.toArray(children)
    .map((c) => (typeof c === "string" || typeof c === "number" ? String(c) : ""))
    .join("");
}

const ATTR_MAP: Record<string, string> = {
  className: "class",
  httpEquiv: "http-equiv",
  charSet: "charset",
};

export const Helmet = forwardRef<HTMLElement, { children?: ReactNode }>(function Helmet(
  { children },
  _ref,
) {
  // Serialize the declared head so the effect only re-runs on real changes.
  const nodes: Array<{ tag: string; props: AnyProps; text: string }> = [];
  let title: string | null = null;

  const walk = (kids: ReactNode) => {
    Children.forEach(kids, (child) => {
      if (!isValidElement(child)) return;
      const tag = typeof child.type === "string" ? child.type : "";
      if (!tag) return;
      const { children: kidChildren, ...rest } = (child.props ?? {}) as AnyProps & { children?: ReactNode };
      if (tag === "title") {
        title = textOf(kidChildren);
        return;
      }
      if (tag !== "meta" && tag !== "link" && tag !== "script") return;
      nodes.push({ tag, props: rest, text: textOf(kidChildren) });
    });
  };
  walk(children);

  const serialized = JSON.stringify({ title, nodes });
  const prevTitle = useRef<string | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const payload = JSON.parse(serialized) as { title: string | null; nodes: typeof nodes };
    const added: Element[] = [];
    const displaced: Array<{ el: Element; parent: Node; next: Node | null }> = [];

    if (payload.title != null) {
      prevTitle.current = document.title;
      document.title = payload.title;
    }

    for (const node of payload.nodes) {
      const id = identityOf(node.tag, node.props);
      if (id) {
        document.head.querySelectorAll(id).forEach((el) => {
          displaced.push({ el, parent: el.parentNode!, next: el.nextSibling });
          el.remove();
        });
      }
      const el = document.createElement(node.tag);
      for (const [k, v] of Object.entries(node.props)) {
        if (v == null || v === false) continue;
        el.setAttribute(ATTR_MAP[k] ?? k, String(v));
      }
      if (node.text) el.textContent = node.text;
      el.setAttribute("data-managed-head", "true");
      document.head.appendChild(el);
      added.push(el);
    }

    return () => {
      added.forEach((el) => el.remove());
      displaced.forEach(({ el, parent, next }) => {
        try {
          parent.insertBefore(el, next);
        } catch {
          document.head.appendChild(el);
        }
      });
      if (payload.title != null && prevTitle.current != null) {
        document.title = prevTitle.current;
      }
    };
  }, [serialized]);

  return null;
});

export default Helmet;
