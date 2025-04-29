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

  let state: anchor.web3.Keypair;
  let currentOwner: anchor.web3.PublicKey;

  before(async () => {
    state = anchor.web3.Keypair.generate();
    currentOwner = provider.wallet.publicKey;
    await program.methods
      .initialize()
      .accounts({
        state: state.publicKey,
        owner: currentOwner,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([state])
      .rpc();
  });

  it("Sets new owner", async () => {
    const newOwner = anchor.web3.Keypair.generate();
    await program.methods
      .setOwner(newOwner.publicKey)
      .accounts({
        state: state.publicKey,
        owner: currentOwner,
      })
      .rpc();

    currentOwner = newOwner.publicKey;

    // Verify new owner can perform operations
    const mint = await createMint(
      provider.connection,
      provider.wallet.payer,
      newOwner.publicKey,
      newOwner.publicKey,
      DECIMALS
    );

    const tokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      provider.wallet.publicKey
    );

    await program.methods
      .mintTokens(MINT_AMOUNT)
      .accounts({
        state: state.publicKey,
        mint,
        tokenAccount,
        mintAuthority: newOwner.publicKey,
      })
      .signers([newOwner])
      .rpc();

    // Reset owner back to original
    await program.methods
      .setOwner(provider.wallet.publicKey)
      .accounts({
        state: state.publicKey,
        owner: newOwner.publicKey,
      })
      .signers([newOwner])
      .rpc();

    currentOwner = provider.wallet.publicKey;
  });

  it("Fails to set owner with wrong authority", async () => {
    const wrongAuthority = anchor.web3.Keypair.generate();
    try {
      await program.methods
        .setOwner(wrongAuthority.publicKey)
        .accounts({
          state: state.publicKey,
          owner: wrongAuthority.publicKey,
        })
        .signers([wrongAuthority])
        .rpc();
      expect.fail("Should have failed with wrong authority");
    } catch (err) {
      expect(err.toString()).to.include("Unauthorized");
    }
  });

  it("Mints tokens", async () => {
    const mint = await createMint(
      provider.connection,
      provider.wallet.payer,
      currentOwner,
      currentOwner,
      DECIMALS
    );

    const tokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      provider.wallet.publicKey
    );

    await program.methods
      .mintTokens(MINT_AMOUNT)
      .accounts({
        state: state.publicKey,
        mint,
        tokenAccount,
        mintAuthority: currentOwner,
      })
      .rpc();

    const balance = await provider.connection.getTokenAccountBalance(tokenAccount);
    expect(balance.value.amount).to.equal(MINT_AMOUNT.toString());
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
          state: state.publicKey,
          mint,
          tokenAccount,
          mintAuthority: wrongAuthority.publicKey,
        })
        .signers([wrongAuthority])
        .rpc();
      expect.fail("Should have failed with wrong authority");
    } catch (err) {
      expect(err.toString()).to.include("Unauthorized");
    }
  });

  it("Burns tokens", async () => {
    const mint = await createMint(
      provider.connection,
      provider.wallet.payer,
      currentOwner,
      currentOwner,
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
        state: state.publicKey,
        mint,
        tokenAccount,
        mintAuthority: currentOwner,
      })
      .rpc();

    // Then burn some tokens
    await program.methods
      .burnTokens(BURN_AMOUNT)
      .accounts({
        state: state.publicKey,
        mint,
        tokenAccount,
        burnAuthority: currentOwner,
      })
      .rpc();

    const balance = await provider.connection.getTokenAccountBalance(tokenAccount);
    expect(balance.value.amount).to.equal(MINT_AMOUNT.sub(BURN_AMOUNT).toString());
  });

  it("Fails to burn tokens with wrong authority", async () => {
    const wrongAuthority = anchor.web3.Keypair.generate();
    const mint = await createMint(
      provider.connection,
      provider.wallet.payer,
      currentOwner,
      currentOwner,
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
        state: state.publicKey,
        mint,
        tokenAccount,
        mintAuthority: currentOwner,
      })
      .rpc();

    try {
      await program.methods
        .burnTokens(BURN_AMOUNT)
        .accounts({
          state: state.publicKey,
          mint,
          tokenAccount,
          burnAuthority: wrongAuthority.publicKey,
        })
        .signers([wrongAuthority])
        .rpc();
      expect.fail("Should have failed with wrong authority");
    } catch (err) {
      expect(err.toString()).to.include("Unauthorized");
    }
  });

  it("Mints tokens with different amounts", async () => {
    const mint = await createMint(
      provider.connection,
      provider.wallet.payer,
      currentOwner,
      currentOwner,
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
          state: state.publicKey,
          mint,
          tokenAccount,
          mintAuthority: currentOwner,
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
      currentOwner,
      currentOwner,
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
        state: state.publicKey,
        mint,
        tokenAccount,
        mintAuthority: currentOwner,
      })
      .rpc();

    const burnAmounts = [new anchor.BN(1), new anchor.BN(100), new anchor.BN(1000)];
    let remainingBalance = initialAmount;

    for (const amount of burnAmounts) {
      await program.methods
        .burnTokens(amount)
        .accounts({
          state: state.publicKey,
          mint,
          tokenAccount,
          burnAuthority: currentOwner,
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
      currentOwner,
      currentOwner,
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
          state: state.publicKey,
          mint,
          tokenAccount,
          mintAuthority: currentOwner,
        })
        .rpc();
      expect.fail("Should have failed with zero amount");
    } catch (err) {
      if (err.toString().includes("Blockhash not found")) {
        // Retry once if it's a connection issue
        try {
          await program.methods
            .mintTokens(new anchor.BN(0))
            .accounts({
              state: state.publicKey,
              mint,
              tokenAccount,
              mintAuthority: currentOwner,
            })
            .rpc();
          expect.fail("Should have failed with zero amount");
        } catch (retryErr) {
          expect(retryErr.toString()).to.include("ZeroAmount");
        }
      } else {
        expect(err.toString()).to.include("ZeroAmount");
      }
    }
  });

  it("Fails to burn zero tokens", async () => {
    const mint = await createMint(
      provider.connection,
      provider.wallet.payer,
      currentOwner,
      currentOwner,
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
        state: state.publicKey,
        mint,
        tokenAccount,
        mintAuthority: currentOwner,
      })
      .rpc();

    try {
      await program.methods
        .burnTokens(new anchor.BN(0))
        .accounts({
          state: state.publicKey,
          mint,
          tokenAccount,
          burnAuthority: currentOwner,
        })
        .rpc();
      expect.fail("Should have failed with zero amount");
    } catch (err) {
      if (err.toString().includes("Blockhash not found")) {
        // Retry once if it's a connection issue
        try {
          await program.methods
            .burnTokens(new anchor.BN(0))
            .accounts({
              state: state.publicKey,
              mint,
              tokenAccount,
              burnAuthority: currentOwner,
            })
            .rpc();
          expect.fail("Should have failed with zero amount");
        } catch (retryErr) {
          expect(retryErr.toString()).to.include("ZeroAmount");
        }
      } else {
        expect(err.toString()).to.include("ZeroAmount");
      }
    }
  });
}); 