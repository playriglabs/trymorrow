use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked},
};

declare_id!("AjwKavx3r4NJ9tgmjxv24mCpFLp2QMnKzcRC5J7vaupa");

pub const GIFT_SEED: &[u8] = b"gift";
pub const GIFT_CARD_SEED: &[u8] = b"gift_card";
pub const FUND_SEED: &[u8] = b"fund";

/// Nobody should be able to lock money away for a lifetime by mistyping a year.
pub const MAX_LOCK_SECONDS: i64 = 25 * 365 * 24 * 60 * 60;

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

    /// Locks `amount` of `mint` behind a redeem code instead of a person. Only the sha256 of
    /// the code lives on-chain; whoever presents the code itself can claim the card.
    pub fn create_gift_card(
        ctx: Context<CreateGiftCard>,
        card_id: [u8; 16],
        code_hash: [u8; 32],
        amount: u64,
        expires_at: i64,
    ) -> Result<()> {
        require!(amount > 0, MorrowError::ZeroAmount);
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

        let card = &mut ctx.accounts.card;
        card.sender = ctx.accounts.sender.key();
        card.code_hash = code_hash;
        card.mint = ctx.accounts.mint.key();
        card.rent_payer = ctx.accounts.payer.key();
        card.amount = amount;
        card.expires_at = expires_at;
        card.card_id = card_id;
        card.bump = ctx.bumps.card;

        emit!(GiftCardCreated {
            card: card.key(),
            sender: card.sender,
            code_hash,
            mint: card.mint,
            amount,
            expires_at,
        });
        Ok(())
    }

    /// Redeems a card to whoever presents the code. There is no recipient check to pass:
    /// the code itself is the authority, and it dies with the card once claimed.
    pub fn claim_gift_card(ctx: Context<ClaimGiftCard>, code: [u8; 16]) -> Result<()> {
        require!(
            solana_sha256_hasher::hash(&code).to_bytes() == ctx.accounts.card.code_hash,
            MorrowError::WrongCode
        );
        let (sender, card_id, bump) = {
            let card = &ctx.accounts.card;
            (card.sender, card.card_id, card.bump)
        };
        let seeds: &[&[u8]] = &[GIFT_CARD_SEED, sender.as_ref(), &card_id, &[bump]];
        let amount = ctx.accounts.vault.amount;

        release_vault(
            &ctx.accounts.token_program,
            &ctx.accounts.mint,
            &ctx.accounts.vault,
            ctx.accounts.claimant_token.to_account_info(),
            ctx.accounts.card.to_account_info(),
            ctx.accounts.rent_payer.to_account_info(),
            seeds,
        )?;

        emit!(GiftCardClaimed {
            card: ctx.accounts.card.key(),
            claimant: ctx.accounts.claimant.key(),
            amount,
        });
        Ok(())
    }

    /// The sender can take a card back any time before it is redeemed.
    /// After expiry anyone can trigger the refund, so unredeemed cards always go home.
    pub fn refund_gift_card(ctx: Context<RefundGiftCard>) -> Result<()> {
        let (sender, card_id, bump, expires_at) = {
            let card = &ctx.accounts.card;
            (card.sender, card.card_id, card.bump, card.expires_at)
        };
        require!(
            ctx.accounts.authority.key() == sender
                || Clock::get()?.unix_timestamp >= expires_at,
            MorrowError::NotRefundable
        );
        let seeds: &[&[u8]] = &[GIFT_CARD_SEED, sender.as_ref(), &card_id, &[bump]];
        let amount = ctx.accounts.vault.amount;

        release_vault(
            &ctx.accounts.token_program,
            &ctx.accounts.mint,
            &ctx.accounts.vault,
            ctx.accounts.sender_token.to_account_info(),
            ctx.accounts.card.to_account_info(),
            ctx.accounts.rent_payer.to_account_info(),
            seeds,
        )?;

        emit!(GiftCardRefunded {
            card: ctx.accounts.card.key(),
            sender,
            amount,
        });
        Ok(())
    }

    /// Opens a pot for someone that nobody can touch until `unlock_at`, not even its creator.
    /// It holds no money yet: a vault is opened per stock the first time someone adds that stock.
    pub fn create_fund(
        ctx: Context<CreateFund>,
        fund_id: [u8; 16],
        beneficiary: Pubkey,
        unlock_at: i64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(
            unlock_at > now && unlock_at <= now + MAX_LOCK_SECONDS,
            MorrowError::InvalidUnlock
        );

        let fund = &mut ctx.accounts.fund;
        fund.creator = ctx.accounts.creator.key();
        fund.beneficiary = beneficiary;
        fund.rent_payer = ctx.accounts.payer.key();
        fund.unlock_at = unlock_at;
        fund.vaults = 0;
        fund.fund_id = fund_id;
        fund.bump = ctx.bumps.fund;

        emit!(FundCreated {
            fund: fund.key(),
            creator: fund.creator,
            beneficiary,
            unlock_at,
        });
        Ok(())
    }

    /// Anyone can add shares of any stock to a fund; what goes in can only ever come out at unlock.
    pub fn contribute(ctx: Context<Contribute>, amount: u64) -> Result<()> {
        require!(amount > 0, MorrowError::ZeroAmount);

        // A vault only exists while it holds something: `withdraw` closes it. An empty one here is
        // one this instruction just opened, so the fund can count what is still open.
        if ctx.accounts.vault.amount == 0 {
            ctx.accounts.fund.vaults = ctx.accounts.fund.vaults.saturating_add(1);
        }

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.contributor_token.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.contributor.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.mint.decimals,
        )?;

        emit!(FundContribution {
            fund: ctx.accounts.fund.key(),
            contributor: ctx.accounts.contributor.key(),
            mint: ctx.accounts.mint.key(),
            amount,
        });
        Ok(())
    }

    /// After the unlock date the beneficiary takes one stock out, and the vault's rent goes back
    /// to whoever paid it. One instruction per stock the fund holds.
    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        let (creator, fund_id, bump, unlock_at) = {
            let fund = &ctx.accounts.fund;
            (fund.creator, fund.fund_id, fund.bump, fund.unlock_at)
        };
        require!(
            Clock::get()?.unix_timestamp >= unlock_at,
            MorrowError::StillLocked
        );
        let seeds: &[&[u8]] = &[FUND_SEED, creator.as_ref(), &fund_id, &[bump]];
        let amount = ctx.accounts.vault.amount;

        release_vault(
            &ctx.accounts.token_program,
            &ctx.accounts.mint,
            &ctx.accounts.vault,
            ctx.accounts.beneficiary_token.to_account_info(),
            ctx.accounts.fund.to_account_info(),
            ctx.accounts.rent_payer.to_account_info(),
            seeds,
        )?;
        ctx.accounts.fund.vaults = ctx.accounts.fund.vaults.saturating_sub(1);

        emit!(FundWithdrawn {
            fund: ctx.accounts.fund.key(),
            beneficiary: ctx.accounts.beneficiary.key(),
            mint: ctx.accounts.mint.key(),
            amount,
        });
        Ok(())
    }

    /// Once every vault is empty the fund account itself is closed and its rent comes back.
    pub fn close_fund(ctx: Context<CloseFund>) -> Result<()> {
        require!(ctx.accounts.fund.vaults == 0, MorrowError::FundNotEmpty);
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

#[derive(Accounts)]
#[instruction(card_id: [u8; 16])]
pub struct CreateGiftCard<'info> {
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
        space = 8 + GiftCard::INIT_SPACE,
        seeds = [GIFT_CARD_SEED, sender.key().as_ref(), card_id.as_ref()],
        bump,
    )]
    pub card: Account<'info, GiftCard>,
    #[account(
        init,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = card,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimGiftCard<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// Signer slot 1: the cron reads this account from the claim instruction to learn who
    /// redeemed a card whose submit crashed before the row could be updated.
    pub claimant: Signer<'info>,
    #[account(
        mut,
        seeds = [GIFT_CARD_SEED, card.sender.as_ref(), card.card_id.as_ref()],
        bump = card.bump,
        has_one = mint,
        has_one = rent_payer,
        close = rent_payer,
    )]
    pub card: Account<'info, GiftCard>,
    /// CHECK: only receives lamports; pinned to `card.rent_payer` by `has_one`.
    #[account(mut)]
    pub rent_payer: UncheckedAccount<'info>,
    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = card,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = claimant,
        associated_token::token_program = token_program,
    )]
    pub claimant_token: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RefundGiftCard<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [GIFT_CARD_SEED, card.sender.as_ref(), card.card_id.as_ref()],
        bump = card.bump,
        has_one = sender,
        has_one = mint,
        has_one = rent_payer,
        close = rent_payer,
    )]
    pub card: Account<'info, GiftCard>,
    /// CHECK: token destination owner; pinned to `card.sender` by `has_one`.
    pub sender: UncheckedAccount<'info>,
    /// CHECK: only receives lamports; pinned to `card.rent_payer` by `has_one`.
    #[account(mut)]
    pub rent_payer: UncheckedAccount<'info>,
    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = card,
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

#[account]
#[derive(InitSpace)]
pub struct GiftCard {
    pub sender: Pubkey,
    /// Only the sha256 of the redeem code is ever stored; the code itself never touches chain
    pub code_hash: [u8; 32],
    pub mint: Pubkey,
    pub rent_payer: Pubkey,
    pub amount: u64,
    pub expires_at: i64,
    pub card_id: [u8; 16],
    pub bump: u8,
}

#[event]
pub struct GiftCardCreated {
    pub card: Pubkey,
    pub sender: Pubkey,
    pub code_hash: [u8; 32],
    pub mint: Pubkey,
    pub amount: u64,
    pub expires_at: i64,
}

#[event]
pub struct GiftCardClaimed {
    pub card: Pubkey,
    pub claimant: Pubkey,
    pub amount: u64,
}

#[event]
pub struct GiftCardRefunded {
    pub card: Pubkey,
    pub sender: Pubkey,
    pub amount: u64,
}

#[derive(Accounts)]
#[instruction(fund_id: [u8; 16])]
pub struct CreateFund<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub creator: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + Fund::INIT_SPACE,
        seeds = [FUND_SEED, creator.key().as_ref(), fund_id.as_ref()],
        bump,
    )]
    pub fund: Account<'info, Fund>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Contribute<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub contributor: Signer<'info>,
    #[account(
        mut,
        seeds = [FUND_SEED, fund.creator.as_ref(), fund.fund_id.as_ref()],
        bump = fund.bump,
    )]
    pub fund: Account<'info, Fund>,
    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = contributor,
        token::token_program = token_program,
    )]
    pub contributor_token: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = fund,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub beneficiary: Signer<'info>,
    #[account(
        mut,
        seeds = [FUND_SEED, fund.creator.as_ref(), fund.fund_id.as_ref()],
        bump = fund.bump,
        has_one = beneficiary @ MorrowError::WrongBeneficiary,
        has_one = rent_payer,
    )]
    pub fund: Account<'info, Fund>,
    /// CHECK: only receives lamports; pinned to `fund.rent_payer` by `has_one`.
    #[account(mut)]
    pub rent_payer: UncheckedAccount<'info>,
    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = fund,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = beneficiary,
        associated_token::token_program = token_program,
    )]
    pub beneficiary_token: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseFund<'info> {
    #[account(mut)]
    pub rent_payer: Signer<'info>,
    #[account(
        mut,
        seeds = [FUND_SEED, fund.creator.as_ref(), fund.fund_id.as_ref()],
        bump = fund.bump,
        has_one = rent_payer,
        close = rent_payer,
    )]
    pub fund: Account<'info, Fund>,
}

#[account]
#[derive(InitSpace)]
pub struct Fund {
    pub creator: Pubkey,
    /// The only account that can ever take the money out, and only after `unlock_at`
    pub beneficiary: Pubkey,
    pub rent_payer: Pubkey,
    pub unlock_at: i64,
    /// Vaults still open, so the fund account is only closed once nothing is left
    pub vaults: u16,
    pub fund_id: [u8; 16],
    pub bump: u8,
}

#[event]
pub struct FundCreated {
    pub fund: Pubkey,
    pub creator: Pubkey,
    pub beneficiary: Pubkey,
    pub unlock_at: i64,
}

#[event]
pub struct FundContribution {
    pub fund: Pubkey,
    pub contributor: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
}

#[event]
pub struct FundWithdrawn {
    pub fund: Pubkey,
    pub beneficiary: Pubkey,
    pub mint: Pubkey,
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
    #[msg("Pick an unlock date in the future, within 25 years")]
    InvalidUnlock,
    #[msg("This fund is still locked")]
    StillLocked,
    #[msg("This fund is for a different account")]
    WrongBeneficiary,
    #[msg("This fund still holds shares")]
    FundNotEmpty,
    #[msg("That redeem code didn't work")]
    WrongCode,
}
