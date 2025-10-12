use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount};

declare_id!("97p5HxyC14H8f9ykCVLiB4giqnzw3oEYo6sTGjKVsP8a");

/// Event emitted when tokens are minted
#[event]
pub struct MintEvent {
    /// The token account receiving the minted tokens
    pub to: Pubkey,
    /// The amount of tokens minted
    pub amount: u64,
    /// The timestamp when the minting occurred
    pub timestamp: i64,
    /// The authority that authorized the minting
    pub authority: Pubkey,
}

/// Event emitted when tokens are burned
#[event]
pub struct BurnEvent {
    /// The token account losing the burned tokens
    pub from: Pubkey,
    /// The amount of tokens burned
    pub amount: u64,
    /// The timestamp when the burning occurred
    pub timestamp: i64,
    /// The authority that authorized the burning
    pub authority: Pubkey,
}

/// Event emitted when a minter is added
#[event]
pub struct AddMinterEvent {
    /// The account being added as a minter
    pub minter: Pubkey,
    /// The authority that added the minter
    pub authority: Pubkey,
    /// The timestamp when the minter was added
    pub timestamp: i64,
}

/// Event emitted when a minter is removed
#[event]
pub struct RemoveMinterEvent {
    /// The account being removed as a minter
    pub minter: Pubkey,
    /// The authority that removed the minter
    pub authority: Pubkey,
    /// The timestamp when the minter was removed
    pub timestamp: i64,
}

/// Event emitted when a burner is added
#[event]
pub struct AddBurnerEvent {
    /// The account being added as a burner
    pub burner: Pubkey,
    /// The authority that added the burner
    pub authority: Pubkey,
    /// The timestamp when the burner was added
    pub timestamp: i64,
}

/// Event emitted when a burner is removed
#[event]
pub struct RemoveBurnerEvent {
    /// The account being removed as a burner
    pub burner: Pubkey,
    /// The authority that removed the burner
    pub authority: Pubkey,
    /// The timestamp when the burner was removed
    pub timestamp: i64,
}

#[program]
pub mod tokenizer {
    use super::*;

    /// Initializes the tokenizer program.
    ///
    /// # Arguments
    /// * `ctx` - The context containing the state account and owner
    ///
    /// # Errors
    /// Returns an error if:
    /// * The state account cannot be initialized
    /// * The owner is not a signer
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.owner = ctx.accounts.owner.key();
        state.admin = ctx.accounts.owner.key();
        state.paused = false;
        state.minters = Vec::new();
        state.burners = Vec::new();
        Ok(())
    }

    /// Adds a new minter to the list of authorized minters.
    ///
    /// # Arguments
    /// * `ctx` - The context containing the state account and authority
    /// * `minter` - The public key of the account to add as a minter
    ///
    /// # Errors
    /// Returns an error if:
    /// * The authority is not the owner or admin
    /// * The minter is already in the list
    pub fn add_minter(ctx: Context<AddMinter>, minter: Pubkey) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(
            state.owner == ctx.accounts.authority.key()
                || state.admin == ctx.accounts.authority.key(),
            TokenizerError::Unauthorized
        );
        require!(
            !state.minters.contains(&minter),
            TokenizerError::AlreadyExists
        );
        state.minters.push(minter);

        emit!(AddMinterEvent {
            minter,
            authority: ctx.accounts.authority.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Removes a minter from the list of authorized minters.
    ///
    /// # Arguments
    /// * `ctx` - The context containing the state account and authority
    /// * `minter` - The public key of the account to remove from minters
    ///
    /// # Errors
    /// Returns an error if:
    /// * The authority is not the owner or admin
    /// * The minter is not in the list
    pub fn remove_minter(ctx: Context<RemoveMinter>, minter: Pubkey) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(
            state.owner == ctx.accounts.authority.key()
                || state.admin == ctx.accounts.authority.key(),
            TokenizerError::Unauthorized
        );
        let index = state
            .minters
            .iter()
            .position(|&x| x == minter)
            .ok_or(TokenizerError::NotFound)?;
        state.minters.remove(index);

        emit!(RemoveMinterEvent {
            minter,
            authority: ctx.accounts.authority.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Adds a new burner to the list of authorized burners.
    ///
    /// # Arguments
    /// * `ctx` - The context containing the state account and authority
    /// * `burner` - The public key of the account to add as a burner
    ///
    /// # Errors
    /// Returns an error if:
    /// * The authority is not the owner or admin
    /// * The burner is already in the list
    pub fn add_burner(ctx: Context<AddBurner>, burner: Pubkey) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(
            state.owner == ctx.accounts.authority.key()
                || state.admin == ctx.accounts.authority.key(),
            TokenizerError::Unauthorized
        );
        require!(
            !state.burners.contains(&burner),
            TokenizerError::AlreadyExists
        );
        state.burners.push(burner);

        emit!(AddBurnerEvent {
            burner,
            authority: ctx.accounts.authority.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Removes a burner from the list of authorized burners.
    ///
    /// # Arguments
    /// * `ctx` - The context containing the state account and authority
    /// * `burner` - The public key of the account to remove from burners
    ///
    /// # Errors
    /// Returns an error if:
    /// * The authority is not the owner or admin
    /// * The burner is not in the list
    pub fn remove_burner(ctx: Context<RemoveBurner>, burner: Pubkey) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(
            state.owner == ctx.accounts.authority.key()
                || state.admin == ctx.accounts.authority.key(),
            TokenizerError::Unauthorized
        );
        let index = state
            .burners
            .iter()
            .position(|&x| x == burner)
            .ok_or(TokenizerError::NotFound)?;
        state.burners.remove(index);

        emit!(RemoveBurnerEvent {
            burner,
            authority: ctx.accounts.authority.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

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
    /// * The amount is zero
    /// * The contract is paused
    /// * The mint authority is not authorized (not owner, admin, or in minters list)
    /// * The token program call fails
    pub fn mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        require!(amount > 0, TokenizerError::ZeroAmount);
        let state = &ctx.accounts.state;
        require!(!state.paused, TokenizerError::Paused);
        require!(
            state.owner == ctx.accounts.mint_authority.key()
                || state.admin == ctx.accounts.mint_authority.key()
                || state.minters.contains(&ctx.accounts.mint_authority.key()),
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

        emit!(MintEvent {
            to: ctx.accounts.token_account.key(),
            amount,
            timestamp: Clock::get()?.unix_timestamp,
            authority: ctx.accounts.mint_authority.key(),
        });

        Ok(())
    }

    /// Burns tokens from a specified token account.
    ///
    /// # Arguments
    /// * `ctx` - The context containing the mint, token account, and authority
    /// * `amount` - The number of tokens to burn (in base units)
    ///
    /// # Errors
    /// Returns an error if:
    /// * The amount is zero
    /// * The contract is paused
    /// * The burn authority is not authorized (not owner, admin, or in burners list)
    /// * The token program call fails
    pub fn burn_tokens(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        require!(amount > 0, TokenizerError::ZeroAmount);
        let state = &ctx.accounts.state;
        require!(!state.paused, TokenizerError::Paused);
        require!(
            state.owner == ctx.accounts.burn_authority.key()
                || state.admin == ctx.accounts.burn_authority.key()
                || state.burners.contains(&ctx.accounts.burn_authority.key()),
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

        emit!(BurnEvent {
            from: ctx.accounts.token_account.key(),
            amount,
            timestamp: Clock::get()?.unix_timestamp,
            authority: ctx.accounts.burn_authority.key(),
        });

        Ok(())
    }

    /// Sets the paused state of the contract.
    ///
    /// # Arguments
    /// * `ctx` - The context containing the state account and owner
    /// * `paused` - The new paused state
    ///
    /// # Errors
    /// Returns an error if:
    /// * The caller is not the owner
    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(
            state.owner == ctx.accounts.owner.key() || state.admin == ctx.accounts.owner.key(),
            TokenizerError::Unauthorized
        );
        state.paused = paused;
        Ok(())
    }

    /// Sets a new owner for the contract.
    ///
    /// # Arguments
    /// * `ctx` - The context containing the state account and current owner
    /// * `new_owner` - The public key of the new owner
    ///
    /// # Errors
    /// Returns an error if:
    /// * The caller is not the current owner
    pub fn set_owner(ctx: Context<SetOwner>, new_owner: Pubkey) -> Result<()> {
        let state = &mut ctx.accounts.state;
        require!(
            state.owner == ctx.accounts.owner.key(),
            TokenizerError::Unauthorized
        );
        state.owner = new_owner;
        Ok(())
    }
}

#[account]
pub struct State {
    pub owner: Pubkey,
    pub admin: Pubkey,
    pub paused: bool,
    pub minters: Vec<Pubkey>,
    pub burners: Vec<Pubkey>,
}

/// Accounts required for initializing the contract.
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + // discriminator
                32 + // owner
                32 + // admin
                1 + // paused
                4 + // minters vector length
                (32 * 10) + // space for 10 minters
                4 + // burners vector length
                (32 * 10) // space for 10 burners
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

/// Accounts required for setting paused state
#[derive(Accounts)]
pub struct SetPaused<'info> {
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

/// Accounts required for adding a minter
#[derive(Accounts)]
pub struct AddMinter<'info> {
    #[account(mut)]
    pub state: Account<'info, State>,
    pub authority: Signer<'info>,
}

/// Accounts required for removing a minter
#[derive(Accounts)]
pub struct RemoveMinter<'info> {
    #[account(mut)]
    pub state: Account<'info, State>,
    pub authority: Signer<'info>,
}

/// Accounts required for adding a burner
#[derive(Accounts)]
pub struct AddBurner<'info> {
    #[account(mut)]
    pub state: Account<'info, State>,
    pub authority: Signer<'info>,
}

/// Accounts required for removing a burner
#[derive(Accounts)]
pub struct RemoveBurner<'info> {
    #[account(mut)]
    pub state: Account<'info, State>,
    pub authority: Signer<'info>,
}

#[error_code]
pub enum TokenizerError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Contract is paused")]
    Paused,
    #[msg("Role already exists")]
    AlreadyExists,
    #[msg("Role not found")]
    NotFound,
}
