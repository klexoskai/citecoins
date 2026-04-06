/**
 * Split CITE from deployer (signer 0) to funder / writer / reader (signers 1–3).
 *
 * Usage (with `npx hardhat node` running):
 *   PROTOCOL_ADDRESS=0x... npx hardhat run scripts/fundRoles.js --network localhost
 *
 * Override amounts (whole tokens, 18 decimals):
 *   FUNDER_AMOUNT=50000 WRITER_AMOUNT=50 READER_AMOUNT=500 PROTOCOL_ADDRESS=0x... npx hardhat run scripts/fundRoles.js --network localhost
 */
const hre = require("hardhat");

async function main() {
  const protocolAddr = process.env.PROTOCOL_ADDRESS;
  if (!protocolAddr) {
    throw new Error(
      "Set PROTOCOL_ADDRESS to your deployed CitecoinsProtocol address, e.g.\n" +
        "  PROTOCOL_ADDRESS=0xabc... npx hardhat run scripts/fundRoles.js --network localhost"
    );
  }

  const funderAmt = process.env.FUNDER_AMOUNT ?? "50000";
  const writerAmt = process.env.WRITER_AMOUNT ?? "100";
  const readerAmt = process.env.READER_AMOUNT ?? "1000";

  const [deployer, funder, writer, reader] = await hre.ethers.getSigners();

  const protocol = await hre.ethers.getContractAt(
    "CitecoinsProtocol",
    protocolAddr
  );
  const tokenAddr = await protocol.token();
  const token = await hre.ethers.getContractAt("CitecoinToken", tokenAddr);

  const bal = (addr) => token.balanceOf(addr);

  console.log("CitecoinToken:", tokenAddr);
  console.log("Deployer:", deployer.address);
  console.log(
    "Deployer CITE balance:",
    hre.ethers.formatEther(await bal(deployer.address))
  );
  console.log("Funder:  ", funder.address);
  console.log("Writer:  ", writer.address);
  console.log("Reader:  ", reader.address);

  const amounts = [
    [funder, funderAmt, "funder"],
    [writer, writerAmt, "writer"],
    [reader, readerAmt, "reader"],
  ];

  for (const [signer, human, label] of amounts) {
    const amount = hre.ethers.parseUnits(human, 18);
    console.log(`\nTransferring ${human} CITE -> ${label}...`);
    const tx = await token.connect(deployer).transfer(signer.address, amount);
    await tx.wait();
    console.log(
      `  ${label} balance:`,
      hre.ethers.formatEther(await bal(signer.address))
    );
  }

  console.log(
    "\nDeployer remaining CITE:",
    hre.ethers.formatEther(await bal(deployer.address))
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
