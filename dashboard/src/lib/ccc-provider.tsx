import { ccc } from "@ckb-ccc/connector-react";
import type { ReactNode } from "react";

const testnetClient = new ccc.ClientPublicTestnet();
const mainnetClient = new ccc.ClientPublicMainnet();

const preferredNetworks: ccc.NetworkPreference[] = [
  { addressPrefix: "ckt", signerType: ccc.SignerType.CKB, network: "ckb-testnet" },
  { addressPrefix: "ckb", signerType: ccc.SignerType.CKB, network: "ckb" },
];

export function CccProvider({ children }: { children: ReactNode }) {
  return (
    <ccc.Provider
      name="Vellum"
      defaultClient={testnetClient}
      clientOptions={[
        { name: "CKB Testnet", client: testnetClient },
        { name: "CKB Mainnet", client: mainnetClient },
      ]}
      preferredNetworks={preferredNetworks}
    >
      {children}
    </ccc.Provider>
  );
}
