import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { BrowserProvider, JsonRpcSigner, formatEther } from "ethers";
import { CHAIN_CONFIG } from "./addresses";

interface WalletState {
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  address: string | null;
  chainId: number | null;
  balance: string;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState>({
  provider: null,
  signer: null,
  address: null,
  chainId: null,
  balance: "0",
  isConnecting: false,
  error: null,
  connect: async () => {},
  disconnect: () => {},
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [balance, setBalance] = useState("0");
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    const w = window as Window & { ethereum?: any };
    if (!w.ethereum) {
      setError("No wallet detected. Install MetaMask.");
      return;
    }
    setIsConnecting(true);
    setError(null);
    try {
      const bp = new BrowserProvider(w.ethereum);
      await w.ethereum.request({ method: "eth_requestAccounts" });
      const s = await bp.getSigner();
      const addr = await s.getAddress();
      const net = await bp.getNetwork();
      const bal = await bp.getBalance(addr);

      setProvider(bp);
      setSigner(s);
      setAddress(addr);
      setChainId(Number(net.chainId));
      setBalance(formatEther(bal));
    } catch (err: any) {
      setError(err.message || "Connection failed");
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setProvider(null);
    setSigner(null);
    setAddress(null);
    setChainId(null);
    setBalance("0");
  }, []);

  // Listen for account/chain changes
  useEffect(() => {
    const w = window as Window & { ethereum?: any };
    if (!w.ethereum) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnect();
      } else if (address) {
        connect();
      }
    };

    const handleChainChanged = () => {
      if (address) connect();
    };

    w.ethereum.on("accountsChanged", handleAccountsChanged);
    w.ethereum.on("chainChanged", handleChainChanged);
    return () => {
      w.ethereum?.removeListener("accountsChanged", handleAccountsChanged);
      w.ethereum?.removeListener("chainChanged", handleChainChanged);
    };
  }, [address, connect, disconnect]);

  return (
    <WalletContext.Provider
      value={{ provider, signer, address, chainId, balance, isConnecting, error, connect, disconnect }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}

export function shortenAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function isCorrectChain(chainId: number | null) {
  return chainId === CHAIN_CONFIG.chainId;
}
