use anchor_lang::prelude::*;

declare_id!("EnEkdB3Sr1hiZUKZXGGGEw6dWxKYgmCBozqzPfr8EU9p");

#[program]
pub mod hello_world {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
