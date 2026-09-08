import { Copy } from "lucide-react";
import { useCopyFeedback } from "@vellum/ui";

const EXAMPLE = `import { ccc } from '@ckb-ccc/core'\nimport { resolveDidCkb } from '@ckb-ccc/did-ckb'\n\nconst client = new ccc.ClientPublicTestnet()\nconst record = await resolveDidCkb({ client, did })\n\nif (record?.data.type === 'v1') {\n  console.log(record.data.value.document)\n}`;

export function Docs() {
  const { copied, copy } = useCopyFeedback();
  return (
    <div className="docs-layout site-content">
      <nav className="docs-nav" aria-label="Documentation sections">
        <span>Guides</span>
        <a className="active" href="#resolve">
          Resolve an identity
        </a>
        <a href="#states">Result states</a>
        <a href="#profile">Read profile fields</a>
        <span>Reference</span>
        <a href="https://github.com/ckb-devrel/ccc/tree/master/packages/did-ckb">did:ckb package</a>
        <a href="/transparency">Method transparency</a>
      </nav>
      <article className="docs-article">
        <span className="eyebrow">Guides</span>
        <h1>Resolve an identity</h1>
        <p>
          Resolution returns the canonical DID Metadata Cell and its decoded document. The current
          implementation does not infer reputation or issuer trust from that document.
        </p>
        <h2 id="install">Install</h2>
        <pre>bun add @ckb-ccc/core @ckb-ccc/did-ckb</pre>
        <h2 id="resolve">Resolve</h2>
        <p>
          Pass an identifier and an explicit network client. Invalid identifiers fail before an
          indexer request is made.
        </p>
        <div className="docs-code">
          <div>
            <span className="mono">TypeScript</span>
            <button title="Copy code" aria-label="Copy code" onClick={() => void copy(EXAMPLE)}>
              <Copy size={13} />
              {copied && <span>Copied</span>}
            </button>
          </div>
          <pre>{EXAMPLE}</pre>
        </div>
        <h2 id="states">Result states</h2>
        <ul>
          <li>
            <code>record</code> - a DID cell and decoded v1 document were returned.
          </li>
          <li>
            <code>null</code> - no live cell exists for the identifier on that network.
          </li>
          <li>
            <code>error</code> - the input is invalid or the RPC/indexer request failed.
          </li>
        </ul>
        <h2 id="profile">Read profile fields</h2>
        <p>
          Vellum stores its optional human-readable profile in the <code>services.profile</code>{" "}
          entry with type <code>VellumProfile</code>. Consumers may ignore that service and still
          read a valid did:ckb document.
        </p>
        <div className="docs-pagination">
          <a href="/">Back to product</a>
          <a href="/resolve">Open resolver</a>
        </div>
      </article>
      <nav className="docs-toc" aria-label="On this page">
        <span>On this page</span>
        <a href="#install">Install</a>
        <a href="#resolve">Resolve</a>
        <a href="#states">Result states</a>
        <a href="#profile">Profile fields</a>
      </nav>
    </div>
  );
}
