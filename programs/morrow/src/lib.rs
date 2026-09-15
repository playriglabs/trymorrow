use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked},
};

declare_id!("AjwKavx3r4NJ9tgmjxv24mCpFLp2QMnKzcRC5J7vaupa");

pub const GIFT_SEED: &[u8] = b"gift";

#[program]
pub mod morrow {
    use super::*;

    /// Locks `amount` of `mint` in a vault that only `recipient` can claim.
    /// `payer` covers rent and gets it back when the gift is claimed or refunded.
    pub fn create_gift(
        ctx: Context<CreateGift>,
        gift_id: [u8; 16],
        recipient: Pubkey,
        amount: u64,
        expires_at: i64,
    ) -> Result<()> {
        require!(amount > 0, MorrowError::ZeroAmount);
        require_keys_neq!(recipient, ctx.accounts.sender.key(), MorrowError::SelfGift);
        require!(
            expires_at > Clock::get()?.unix_timestamp,
            MorrowError::InvalidExpiry
        );

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.sender_token.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.sender.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.mint.decimals,
        )?;

        let gift = &mut ctx.accounts.gift;
        gift.sender = ctx.accounts.sender.key();
        gift.recipient = recipient;
        gift.mint = ctx.accounts.mint.key();
        gift.rent_payer = ctx.accounts.payer.key();
        gift.amount = amount;
        gift.expires_at = expires_at;
        gift.gift_id = gift_id;
        gift.bump = ctx.bumps.gift;

        emit!(GiftCreated {
            gift: gift.key(),
            sender: gift.sender,
            recipient,
            mint: gift.mint,
            amount,
            expires_at,
        });
        Ok(())
    }

    /// Only the recipient's own signature can release the gift.
    pub fn claim_gift(ctx: Context<ClaimGift>) -> Result<()> {
        let (sender, gift_id, bump) = {
            let gift = &ctx.accounts.gift;
            (gift.sender, gift.gift_id, gift.bump)
        };
        let seeds: &[&[u8]] = &[GIFT_SEED, sender.as_ref(), &gift_id, &[bump]];
        let amount = ctx.accounts.vault.amount;

        release_vault(
            &ctx.accounts.token_program,
            &ctx.accounts.mint,
            &ctx.accounts.vault,
            ctx.accounts.recipient_token.to_account_info(),
            ctx.accounts.gift.to_account_info(),
            ctx.accounts.rent_payer.to_account_info(),
            seeds,
        )?;

        emit!(GiftClaimed {
            gift: ctx.accounts.gift.key(),
            recipient: ctx.accounts.recipient.key(),
            amount,
        });
        Ok(())
    }

    /// The sender can take a gift back any time before it is claimed.
    /// After expiry anyone can trigger the refund, so unclaimed gifts always go home.
    pub fn refund_gift(ctx: Context<RefundGift>) -> Result<()> {
        let (sender, gift_id, bump, expires_at) = {
            let gift = &ctx.accounts.gift;
            (gift.sender, gift.gift_id, gift.bump, gift.expires_at)
        };
        require!(
            ctx.accounts.authority.key() == sender
                || Clock::get()?.unix_timestamp >= expires_at,
            MorrowError::NotRefundable
        );
        let seeds: &[&[u8]] = &[GIFT_SEED, sender.as_ref(), &gift_id, &[bump]];
        let amount = ctx.accounts.vault.amount;

        release_vault(
            &ctx.accounts.token_program,
            &ctx.accounts.mint,
            &ctx.accounts.vault,
            ctx.accounts.sender_token.to_account_info(),
            ctx.accounts.gift.to_account_info(),
            ctx.accounts.rent_payer.to_account_info(),
            seeds,
        )?;

        emit!(GiftRefunded {
            gift: ctx.accounts.gift.key(),
            sender,
            amount,
        });
        Ok(())
    }
}

/// Moves everything out of a PDA-owned vault, then closes it so rent returns to the payer.
fn release_vault<'info>(
    token_program: &Interface<'info, TokenInterface>,
    mint: &InterfaceAccount<'info, Mint>,
    vault: &InterfaceAccount<'info, TokenAccount>,
    destination: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    rent_receiver: AccountInfo<'info>,
    seeds: &[&[u8]],
) -> Result<()> {
    let signer_seeds = &[seeds];

    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            TransferChecked {
                from: vault.to_account_info(),
                mint: mint.to_account_info(),
                to: destination,
                authority: authority.clone(),
            },
            signer_seeds,
        ),
        vault.amount,
        mint.decimals,
    )?;

    token_interface::close_account(CpiContext::new_with_signer(
        token_program.to_account_info(),
        CloseAccount {
            account: vault.to_account_info(),
            destination: rent_receiver,
            authority,
        },
        signer_seeds,
    ))
}

#[derive(Accounts)]
#[instruction(gift_id: [u8; 16])]
pub struct CreateGift<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub sender: Signer<'info>,
    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = sender,
        token::token_program = token_program,
    )]
    pub sender_token: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init,
        payer = payer,
        space = 8 + Gift::INIT_SPACE,
        seeds = [GIFT_SEED, sender.key().as_ref(), gift_id.as_ref()],
        bump,
    )]
    pub gift: Account<'info, Gift>,
    #[account(
        init,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = gift,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimGift<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub recipient: Signer<'info>,
    #[account(
        mut,
        seeds = [GIFT_SEED, gift.sender.as_ref(), gift.gift_id.as_ref()],
        bump = gift.bump,
        has_one = recipient @ MorrowError::WrongRecipient,
        has_one = mint,
        has_one = rent_payer,
        close = rent_payer,
    )]
    pub gift: Account<'info, Gift>,
    /// CHECK: only receives lamports; pinned to `gift.rent_payer` by `has_one`.
    #[account(mut)]
    pub rent_payer: UncheckedAccount<'info>,
    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = gift,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = recipient,
        associated_token::token_program = token_program,
    )]
    pub recipient_token: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RefundGift<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [GIFT_SEED, gift.sender.as_ref(), gift.gift_id.as_ref()],
        bump = gift.bump,
        has_one = sender,
        has_one = mint,
        has_one = rent_payer,
        close = rent_payer,
    )]
    pub gift: Account<'info, Gift>,
    /// CHECK: token destination owner; pinned to `gift.sender` by `has_one`.
    pub sender: UncheckedAccount<'info>,
    /// CHECK: only receives lamports; pinned to `gift.rent_payer` by `has_one`.
    #[account(mut)]
    pub rent_payer: UncheckedAccount<'info>,
    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = gift,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = sender,
        associated_token::token_program = token_program,
    )]
    pub sender_token: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Gift {
    pub sender: Pubkey,
    pub recipient: Pubkey,
    pub mint: Pubkey,
    pub rent_payer: Pubkey,
    pub amount: u64,
    pub expires_at: i64,
    pub gift_id: [u8; 16],
    pub bump: u8,
}

#[event]
pub struct GiftCreated {
    pub gift: Pubkey,
    pub sender: Pubkey,
    pub recipient: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub expires_at: i64,
}

#[event]
pub struct GiftClaimed {
    pub gift: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
}

#[event]
pub struct GiftRefunded {
    pub gift: Pubkey,
    pub sender: Pubkey,
    pub amount: u64,
}

#[error_code]
pub enum MorrowError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("You can't send a gift to yourself")]
    SelfGift,
    #[msg("Expiry must be in the future")]
    InvalidExpiry,
    #[msg("This gift is for a different account")]
    WrongRecipient,
    #[msg("Only the sender can take this gift back before it expires")]
    NotRefundable,
}
