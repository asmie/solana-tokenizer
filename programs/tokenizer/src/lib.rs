use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount};

declare_id!("97p5HxyC14H8f9ykCVLiB4giqnzw3oEYo6sTGjKVsP8a");

#[program]
pub mod tokenizer {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.owner = ctx.accounts.owner.key();
        Ok(())
    }

    pub fn set_owner(ctx: Context<SetOwner>, new_owner: Pubkey) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(
            state.owner == ctx.accounts.owner.key(),
            TokenizerError::Unauthorized
        );
        state.owner = new_owner;
        Ok(())
    }

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
    pub fn mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        require!(amount > 0, TokenizerError::ZeroAmount);
        require!(
            ctx.accounts.state.owner == ctx.accounts.mint_authority.key(),
            TokenizerError::Unauthorized
        );

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
    pub fn burn_tokens(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        require!(amount > 0, TokenizerError::ZeroAmount);
        require!(
            ctx.accounts.state.owner == ctx.accounts.burn_authority.key(),
            TokenizerError::Unauthorized
        );

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

#[account]
pub struct State {
    pub owner: Pubkey,
}

/// Accounts required for initializing the contract.
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + 32 // 8 for discriminator + 32 for pubkey
    )]
    pub state: Account<'info, State>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// Accounts required for setting a new owner.
#[derive(Accounts)]
pub struct SetOwner<'info> {
    #[account(mut)]
    pub state: Account<'info, State>,
    pub owner: Signer<'info>,
}

/// Accounts required for minting new tokens.
#[derive(Accounts)]
pub struct MintTokens<'info> {
    #[account(mut)]
    pub state: Account<'info, State>,
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
    #[account(mut)]
    pub state: Account<'info, State>,
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

#[error_code]
pub enum TokenizerError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Unauthorized")]
    Unauthorized,
}
