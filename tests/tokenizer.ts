import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Tokenizer } from "../target/types/tokenizer";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createMint, createAssociatedTokenAccount } from "@solana/spl-token";
import { expect } from "chai";

describe("tokenizer", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Tokenizer as Program<Tokenizer>;

  const DECIMALS = 9;
  const MINT_AMOUNT = new anchor.BN(1000);
  const BURN_AMOUNT = new anchor.BN(500);

  it("Mints tokens", async () => {
    // Create mint account
    const mint = await createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      provider.wallet.publicKey,
      DECIMALS
    );

    // Create associated token account
    const tokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      provider.wallet.publicKey
    );

    await program.methods
      .mintTokens(MINT_AMOUNT)
      .accounts({
        mint,
        tokenAccount,
        mintAuthority: provider.wallet.publicKey,
      })
      .rpc();

    // Check token account balance
    const balance = await provider.connection.getTokenAccountBalance(tokenAccount);
    expect(balance.value.amount).to.equal(MINT_AMOUNT.toString());
  });

  it("Burns tokens", async () => {
    // Create mint account
    const mint = await createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      provider.wallet.publicKey,
      DECIMALS
    );

    // Create associated token account
    const tokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      provider.wallet.publicKey
    );

    // First mint some tokens
    await program.methods
      .mintTokens(MINT_AMOUNT)
      .accounts({
        mint,
        tokenAccount,
        mintAuthority: provider.wallet.publicKey,
      })
      .rpc();

    // Then burn some tokens
    await program.methods
      .burnTokens(BURN_AMOUNT)
      .accounts({
        mint,
        tokenAccount,
        burnAuthority: provider.wallet.publicKey,
      })
      .rpc();

    // Check token account balance
    const balance = await provider.connection.getTokenAccountBalance(tokenAccount);
    expect(balance.value.amount).to.equal(MINT_AMOUNT.sub(BURN_AMOUNT).toString());
  });

  it("Fails to mint tokens with wrong authority", async () => {
    const wrongAuthority = anchor.web3.Keypair.generate();
    const mint = await createMint(
      provider.connection,
      provider.wallet.payer,
      wrongAuthority.publicKey,
      wrongAuthority.publicKey,
      DECIMALS
    );

    const tokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      provider.wallet.publicKey
    );

    try {
      await program.methods
        .mintTokens(MINT_AMOUNT)
        .accounts({
          mint,
          tokenAccount,
          mintAuthority: wrongAuthority.publicKey,
        })
        .rpc();
      expect.fail("Should have failed with wrong authority");
    } catch (err) {
      expect(err.toString()).to.include("Error");
    }
  });

  it("Fails to burn tokens with insufficient balance", async () => {
    const mint = await createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      provider.wallet.publicKey,
      DECIMALS
    );

    const tokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      provider.wallet.publicKey
    );

    try {
      await program.methods
        .burnTokens(BURN_AMOUNT)
        .accounts({
          mint,
          tokenAccount,
          burnAuthority: provider.wallet.publicKey,
        })
        .rpc();
      expect.fail("Should have failed with insufficient balance");
    } catch (err) {
      expect(err.toString()).to.include("Error");
    }
  });

  it("Mints tokens with different amounts", async () => {
    const mint = await createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      provider.wallet.publicKey,
      DECIMALS
    );

    const tokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      provider.wallet.publicKey
    );

    const amounts = [new anchor.BN(1), new anchor.BN(100), new anchor.BN(10000)];
    let totalMinted = new anchor.BN(0);

    for (const amount of amounts) {
      await program.methods
        .mintTokens(amount)
        .accounts({
          mint,
          tokenAccount,
          mintAuthority: provider.wallet.publicKey,
        })
        .rpc();

      totalMinted = totalMinted.add(amount);
      const balance = await provider.connection.getTokenAccountBalance(tokenAccount);
      expect(balance.value.amount).to.equal(totalMinted.toString());
    }
  });

  it("Burns tokens with different amounts", async () => {
    const mint = await createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      provider.wallet.publicKey,
      DECIMALS
    );

    const tokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      provider.wallet.publicKey
    );

    // First mint a large amount
    const initialAmount = new anchor.BN(10000);
    await program.methods
      .mintTokens(initialAmount)
      .accounts({
        mint,
        tokenAccount,
        mintAuthority: provider.wallet.publicKey,
      })
      .rpc();

    const burnAmounts = [new anchor.BN(1), new anchor.BN(100), new anchor.BN(1000)];
    let remainingBalance = initialAmount;

    for (const amount of burnAmounts) {
      await program.methods
        .burnTokens(amount)
        .accounts({
          mint,
          tokenAccount,
          burnAuthority: provider.wallet.publicKey,
        })
        .rpc();

      remainingBalance = remainingBalance.sub(amount);
      const balance = await provider.connection.getTokenAccountBalance(tokenAccount);
      expect(balance.value.amount).to.equal(remainingBalance.toString());
    }
  });

  it("Fails to mint zero tokens", async () => {
    const mint = await createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      provider.wallet.publicKey,
      DECIMALS
    );

    const tokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      provider.wallet.publicKey
    );

    try {
      await program.methods
        .mintTokens(new anchor.BN(0))
        .accounts({
          mint,
          tokenAccount,
          mintAuthority: provider.wallet.publicKey,
        })
        .rpc();
      expect.fail("Should have failed with zero amount");
    } catch (err) {
      expect(err.toString()).to.include("Error");
    }
  });

  it("Fails to burn zero tokens", async () => {
    const mint = await createMint(
      provider.connection,
      provider.wallet.payer,
      provider.wallet.publicKey,
      provider.wallet.publicKey,
      DECIMALS
    );

    const tokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      provider.wallet.publicKey
    );

    // First mint some tokens
    await program.methods
      .mintTokens(MINT_AMOUNT)
      .accounts({
        mint,
        tokenAccount,
        mintAuthority: provider.wallet.publicKey,
      })
      .rpc();

    try {
      await program.methods
        .burnTokens(new anchor.BN(0))
        .accounts({
          mint,
          tokenAccount,
          burnAuthority: provider.wallet.publicKey,
        })
        .rpc();
      expect.fail("Should have failed with zero amount");
    } catch (err) {
      expect(err.toString()).to.include("Error");
    }
  });
}); 