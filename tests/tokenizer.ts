import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Tokenizer } from "../target/types/tokenizer";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createMint, createAssociatedTokenAccount } from "@solana/spl-token";
import { expect } from "chai";
import { Buffer } from "buffer";

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

  it("Mints tokens with owner", async () => {
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
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const balance = await provider.connection.getTokenAccountBalance(tokenAccount);
    expect(balance.value.amount).to.equal(MINT_AMOUNT.toString());
  });

  it("Burns tokens with owner", async () => {
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
        tokenProgram: TOKEN_PROGRAM_ID,
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
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

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

  it("Sets paused state", async () => {
    await program.methods
      .setPaused(true)
      .accounts({
        state: state.publicKey,
        owner: currentOwner,
      })
      .rpc();

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
        .mintTokens(MINT_AMOUNT)
        .accounts({
          state: state.publicKey,
          mint,
          tokenAccount,
          mintAuthority: currentOwner,
        })
        .rpc();
      expect.fail("Should have failed when paused");
    } catch (err) {
      expect(err.toString()).to.include("Paused");
    }

    // Unpause
    await program.methods
      .setPaused(false)
      .accounts({
        state: state.publicKey,
        owner: currentOwner,
      })
      .rpc();

    // Should work again
    await program.methods
      .mintTokens(MINT_AMOUNT)
      .accounts({
        state: state.publicKey,
        mint,
        tokenAccount,
        mintAuthority: currentOwner,
      })
      .rpc();
  });

  it("Fails to set paused state with wrong authority", async () => {
    const wrongAuthority = anchor.web3.Keypair.generate();
    try {
      await program.methods
        .setPaused(true)
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

  async function getConfirmedTransaction(signature: string, maxRetries = 5): Promise<any> {
    for (let i = 0; i < maxRetries; i++) {
      const transaction = await program.provider.connection.getTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      
      if (transaction && transaction.meta && transaction.meta.logMessages && transaction.meta.logMessages.length > 0) {
        return transaction;
      }
      
      // Wait for 1 second before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error(`Failed to get confirmed transaction with valid log messages after ${maxRetries} retries`);
  }

  async function getEventFromTransaction<I extends anchor.Idl>(
    txSignature: string,
    program: Program<I>,
    eventName: string
  ) {
    const transaction = await getConfirmedTransaction(txSignature);
    expect(transaction.meta.logMessages).to.not.be.null;
    expect(transaction.meta.logMessages.length).to.be.greaterThan(0);
  
    for (const log of transaction.meta.logMessages) {
      if (log.startsWith("Program data: ")) {
        const base64Data = log.slice("Program data: ".length);
        const buffer = Buffer.from(base64Data, "base64");
        const decodedEvent = program.coder.events.decode(buffer as Buffer);
        if (decodedEvent?.name === eventName) {
          return decodedEvent;
        }
      }
    }
  
    throw new Error(`Event ${eventName} not found in transaction logs`);
  }

  it("Adds and removes minters with events", async () => {
    const newMinter = anchor.web3.Keypair.generate();
    
    // Add minter and verify event
    const addTx = await program.methods
      .addMinter(newMinter.publicKey)
      .accounts({
        state: state.publicKey,
        authority: currentOwner,
      })
      .rpc();

    const event = await getEventFromTransaction(addTx, program, "addMinterEvent");
    expect(event.data.minter.equals(newMinter.publicKey)).to.be.true;
    expect(event.data.authority.equals(currentOwner)).to.be.true;

    // Remove minter and verify event
    const removeTx = await program.methods
      .removeMinter(newMinter.publicKey)
      .accounts({
        state: state.publicKey,
        authority: currentOwner,
      })
      .rpc();

    const removeEvent = await getEventFromTransaction(removeTx, program, "removeMinterEvent");
    expect(removeEvent.data.minter.equals(newMinter.publicKey)).to.be.true;
    expect(removeEvent.data.authority.equals(currentOwner)).to.be.true;
  });

  it("Adds and removes burners with events", async () => {
    const newBurner = anchor.web3.Keypair.generate();
    
    // Add burner and verify event
    const addTx = await program.methods
      .addBurner(newBurner.publicKey)
      .accounts({
        state: state.publicKey,
        authority: currentOwner,
      })
      .rpc();

    const addEvent = await getEventFromTransaction(addTx, program, "addBurnerEvent");
    expect(addEvent.data.burner.equals(newBurner.publicKey)).to.be.true;
    expect(addEvent.data.authority.equals(currentOwner)).to.be.true;

    // Remove burner and verify event
    const removeTx = await program.methods
      .removeBurner(newBurner.publicKey)
      .accounts({
        state: state.publicKey,
        authority: currentOwner,
      })
      .rpc();

    const removeEvent = await getEventFromTransaction(removeTx, program, "removeBurnerEvent");
    expect(removeEvent.data.burner.equals(newBurner.publicKey)).to.be.true;
    expect(removeEvent.data.authority.equals(currentOwner)).to.be.true;
  });

  it("Mints tokens with event", async () => {
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

    const tx = await program.methods
      .mintTokens(MINT_AMOUNT)
      .accounts({
        state: state.publicKey,
        mint,
        tokenAccount,
        mintAuthority: currentOwner,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const event = await getEventFromTransaction(tx, program, "mintEvent");
    expect(event.data.to.equals(tokenAccount)).to.be.true;
    expect(event.data.amount.toString()).to.equal(MINT_AMOUNT.toString());
    expect(event.data.authority.equals(currentOwner)).to.be.true;
  });

  it("Burns tokens with event", async () => {
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
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    // Then burn and verify event
    const tx = await program.methods
      .burnTokens(BURN_AMOUNT)
      .accounts({
        state: state.publicKey,
        mint,
        tokenAccount,
        burnAuthority: currentOwner,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const event = await getEventFromTransaction(tx, program, "burnEvent");
    expect(event.data.from.equals(tokenAccount)).to.be.true;
    expect(event.data.amount.toString()).to.equal(BURN_AMOUNT.toString());
    expect(event.data.authority.equals(currentOwner)).to.be.true;
  });

  it("Fails to add minter with wrong authority", async () => {
    const wrongAuthority = anchor.web3.Keypair.generate();
    const newMinter = anchor.web3.Keypair.generate();
    
    try {
      await program.methods
        .addMinter(newMinter.publicKey)
        .accounts({
          state: state.publicKey,
          authority: wrongAuthority.publicKey,
        })
        .signers([wrongAuthority])
        .rpc();
      expect.fail("Should have failed with wrong authority");
    } catch (err) {
      expect(err.toString()).to.include("Unauthorized");
    }
  });

  it("Fails to add burner with wrong authority", async () => {
    const wrongAuthority = anchor.web3.Keypair.generate();
    const newBurner = anchor.web3.Keypair.generate();
    
    try {
      await program.methods
        .addBurner(newBurner.publicKey)
        .accounts({
          state: state.publicKey,
          authority: wrongAuthority.publicKey,
        })
        .signers([wrongAuthority])
        .rpc();
      expect.fail("Should have failed with wrong authority");
    } catch (err) {
      expect(err.toString()).to.include("Unauthorized");
    }
  });

  it("Fails to remove non-existent minter", async () => {
    const nonExistentMinter = anchor.web3.Keypair.generate();
    
    try {
      await program.methods
        .removeMinter(nonExistentMinter.publicKey)
        .accounts({
          state: state.publicKey,
          authority: currentOwner,
        })
        .rpc();
      expect.fail("Should have failed with non-existent minter");
    } catch (err) {
      expect(err.toString()).to.include("NotFound");
    }
  });

  it("Fails to remove non-existent burner", async () => {
    const nonExistentBurner = anchor.web3.Keypair.generate();
    
    try {
      await program.methods
        .removeBurner(nonExistentBurner.publicKey)
        .accounts({
          state: state.publicKey,
          authority: currentOwner,
        })
        .rpc();
      expect.fail("Should have failed with non-existent burner");
    } catch (err) {
      expect(err.toString()).to.include("NotFound");
    }
  });

  it("Fails to add duplicate minter", async () => {
    const newMinter = anchor.web3.Keypair.generate();
    
    // Add minter first time
    await program.methods
      .addMinter(newMinter.publicKey)
      .accounts({
        state: state.publicKey,
        authority: currentOwner,
      })
      .rpc();

    // Try to add again
    try {
      await program.methods
        .addMinter(newMinter.publicKey)
        .accounts({
          state: state.publicKey,
          authority: currentOwner,
        })
        .rpc();
      expect.fail("Should have failed with duplicate minter");
    } catch (err) {
      expect(err.toString()).to.include("AlreadyExists");
    }
  });

  it("Fails to add duplicate burner", async () => {
    const newBurner = anchor.web3.Keypair.generate();
    
    // Add burner first time
    await program.methods
      .addBurner(newBurner.publicKey)
      .accounts({
        state: state.publicKey,
        authority: currentOwner,
      })
      .rpc();

    // Try to add again
    try {
      await program.methods
        .addBurner(newBurner.publicKey)
        .accounts({
          state: state.publicKey,
          authority: currentOwner,
        })
        .rpc();
      expect.fail("Should have failed with duplicate burner");
    } catch (err) {
      expect(err.toString()).to.include("AlreadyExists");
    }
  });

  it("Transfers tokens between accounts", async () => {
    const mint = await createMint(
      provider.connection,
      provider.wallet.payer,
      currentOwner,
      currentOwner,
      DECIMALS
    );

    const fromTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      provider.wallet.publicKey
    );

    const recipient = anchor.web3.Keypair.generate();
    const toTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      recipient.publicKey
    );

    // First mint some tokens to the from account
    await program.methods
      .mintTokens(MINT_AMOUNT)
      .accounts({
        state: state.publicKey,
        mint,
        tokenAccount: fromTokenAccount,
        mintAuthority: currentOwner,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    // Transfer tokens
    const transferAmount = new anchor.BN(300);
    await program.methods
      .transferTokens(transferAmount)
      .accounts({
        state: state.publicKey,
        fromTokenAccount,
        toTokenAccount,
        transferAuthority: provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const fromBalance = await provider.connection.getTokenAccountBalance(fromTokenAccount);
    const toBalance = await provider.connection.getTokenAccountBalance(toTokenAccount);

    expect(fromBalance.value.amount).to.equal(MINT_AMOUNT.sub(transferAmount).toString());
    expect(toBalance.value.amount).to.equal(transferAmount.toString());
  });

  it("Transfers tokens with event", async () => {
    const mint = await createMint(
      provider.connection,
      provider.wallet.payer,
      currentOwner,
      currentOwner,
      DECIMALS
    );

    const fromTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      provider.wallet.publicKey
    );

    const recipient = anchor.web3.Keypair.generate();
    const toTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      recipient.publicKey
    );

    // First mint some tokens
    await program.methods
      .mintTokens(MINT_AMOUNT)
      .accounts({
        state: state.publicKey,
        mint,
        tokenAccount: fromTokenAccount,
        mintAuthority: currentOwner,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    // Transfer and verify event
    const transferAmount = new anchor.BN(400);
    const tx = await program.methods
      .transferTokens(transferAmount)
      .accounts({
        state: state.publicKey,
        fromTokenAccount,
        toTokenAccount,
        transferAuthority: provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const event = await getEventFromTransaction(tx, program, "transferEvent");
    expect(event.data.from.equals(fromTokenAccount)).to.be.true;
    expect(event.data.to.equals(toTokenAccount)).to.be.true;
    expect(event.data.amount.toString()).to.equal(transferAmount.toString());
    expect(event.data.authority.equals(provider.wallet.publicKey)).to.be.true;
  });

  it("Transfers tokens with different amounts", async () => {
    const mint = await createMint(
      provider.connection,
      provider.wallet.payer,
      currentOwner,
      currentOwner,
      DECIMALS
    );

    const fromTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      provider.wallet.publicKey
    );

    const recipient = anchor.web3.Keypair.generate();
    const toTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      recipient.publicKey
    );

    // Mint a large amount
    const initialAmount = new anchor.BN(10000);
    await program.methods
      .mintTokens(initialAmount)
      .accounts({
        state: state.publicKey,
        mint,
        tokenAccount: fromTokenAccount,
        mintAuthority: currentOwner,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const transferAmounts = [new anchor.BN(1), new anchor.BN(100), new anchor.BN(1000)];
    let remainingBalance = initialAmount;
    let recipientBalance = new anchor.BN(0);

    for (const amount of transferAmounts) {
      await program.methods
        .transferTokens(amount)
        .accounts({
          state: state.publicKey,
          fromTokenAccount,
          toTokenAccount,
          transferAuthority: provider.wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      remainingBalance = remainingBalance.sub(amount);
      recipientBalance = recipientBalance.add(amount);

      const fromBalance = await provider.connection.getTokenAccountBalance(fromTokenAccount);
      const toBalance = await provider.connection.getTokenAccountBalance(toTokenAccount);

      expect(fromBalance.value.amount).to.equal(remainingBalance.toString());
      expect(toBalance.value.amount).to.equal(recipientBalance.toString());
    }
  });

  it("Fails to transfer zero tokens", async () => {
    const mint = await createMint(
      provider.connection,
      provider.wallet.payer,
      currentOwner,
      currentOwner,
      DECIMALS
    );

    const fromTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      provider.wallet.publicKey
    );

    const recipient = anchor.web3.Keypair.generate();
    const toTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      recipient.publicKey
    );

    // First mint some tokens
    await program.methods
      .mintTokens(MINT_AMOUNT)
      .accounts({
        state: state.publicKey,
        mint,
        tokenAccount: fromTokenAccount,
        mintAuthority: currentOwner,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    try {
      await program.methods
        .transferTokens(new anchor.BN(0))
        .accounts({
          state: state.publicKey,
          fromTokenAccount,
          toTokenAccount,
          transferAuthority: provider.wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      expect.fail("Should have failed with zero amount");
    } catch (err) {
      expect(err.toString()).to.include("ZeroAmount");
    }
  });

  it("Fails to transfer when paused", async () => {
    // Pause the contract
    await program.methods
      .setPaused(true)
      .accounts({
        state: state.publicKey,
        owner: currentOwner,
      })
      .rpc();

    const mint = await createMint(
      provider.connection,
      provider.wallet.payer,
      currentOwner,
      currentOwner,
      DECIMALS
    );

    const fromTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      provider.wallet.publicKey
    );

    const recipient = anchor.web3.Keypair.generate();
    const toTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      recipient.publicKey
    );

    try {
      await program.methods
        .transferTokens(new anchor.BN(100))
        .accounts({
          state: state.publicKey,
          fromTokenAccount,
          toTokenAccount,
          transferAuthority: provider.wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      expect.fail("Should have failed when paused");
    } catch (err) {
      expect(err.toString()).to.include("Paused");
    }

    // Unpause for other tests
    await program.methods
      .setPaused(false)
      .accounts({
        state: state.publicKey,
        owner: currentOwner,
      })
      .rpc();
  });

  it("Fails to transfer with insufficient balance", async () => {
    const mint = await createMint(
      provider.connection,
      provider.wallet.payer,
      currentOwner,
      currentOwner,
      DECIMALS
    );

    const fromTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      provider.wallet.publicKey
    );

    const recipient = anchor.web3.Keypair.generate();
    const toTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      recipient.publicKey
    );

    // Mint only a small amount
    const smallAmount = new anchor.BN(100);
    await program.methods
      .mintTokens(smallAmount)
      .accounts({
        state: state.publicKey,
        mint,
        tokenAccount: fromTokenAccount,
        mintAuthority: currentOwner,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    // Try to transfer more than balance
    try {
      await program.methods
        .transferTokens(new anchor.BN(1000))
        .accounts({
          state: state.publicKey,
          fromTokenAccount,
          toTokenAccount,
          transferAuthority: provider.wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      expect.fail("Should have failed with insufficient balance");
    } catch (err) {
      expect(err).to.exist;
    }
  });
}); 