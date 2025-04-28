use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount};

declare_id!("97p5HxyC14H8f9ykCVLiB4giqnzw3oEYo6sTGjKVsP8a");

#[program]
pub mod tokenizer {
    use super::*;

    /// Mints new tokens to a specified token account.
    ///
    /// # Arguments
    /// * `ctx` - The context containing the mint, token account, and authority
    /// * `amount` - The number of tokens to mint (in base units)
    ///
    /// # Errors
    /// Returns an error if:
    /// * The mint authority is not a signer
    /// * The token account is not associated with the mint
    /// * The token program call fails
    pub fn mint_tokens(
        ctx: Context<MintTokens>,
        amount: u64,
    ) -> Result<()> {
        let cpi_accounts = token::MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.token_account.to_account_info(),
            authority: ctx.accounts.mint_authority.to_account_info(),
        };

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::mint_to(cpi_ctx, amount)?;

        Ok(())
    }

    /// Burns tokens from a specified token account.
    ///
    /// # Arguments
    /// * `ctx` - The context containing the mint, token account, and burn authority
    /// * `amount` - The number of tokens to burn (in base units)
    ///
    /// # Errors
    /// Returns an error if:
    /// * The burn authority is not a signer
    /// * The token account has insufficient balance
    /// * The token program call fails
    pub fn burn_tokens(
        ctx: Context<BurnTokens>,
        amount: u64,
    ) -> Result<()> {
        let cpi_accounts = token::Burn {
            mint: ctx.accounts.mint.to_account_info(),
            from: ctx.accounts.token_account.to_account_info(),
            authority: ctx.accounts.burn_authority.to_account_info(),
        };

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::burn(cpi_ctx, amount)?;

        Ok(())
    }
}

/// Accounts required for minting new tokens.
#[derive(Accounts)]
pub struct MintTokens<'info> {
    /// The mint account
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    /// The token account to receive the minted tokens
    #[account(mut)]
    pub token_account: Account<'info, TokenAccount>,
    /// The mint authority (must be a signer)
    pub mint_authority: Signer<'info>,
    /// The SPL Token program
    /// CHECK: This is the token program
    pub token_program: Program<'info, Token>,
}

/// Accounts required for burning tokens.
#[derive(Accounts)]
pub struct BurnTokens<'info> {
    /// The mint account
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    /// The token account to burn tokens from
    #[account(mut)]
    pub token_account: Account<'info, TokenAccount>,
    /// The burn authority (must be a signer)
    pub burn_authority: Signer<'info>,
    /// The SPL Token program
    /// CHECK: This is the token program
    pub token_program: Program<'info, Token>,
}
