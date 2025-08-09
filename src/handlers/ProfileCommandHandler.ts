import { CommandInteraction, EmbedBuilder } from 'discord.js';
import { BaseCommandHandler } from './CommandHandler';
import { UserAccountService, UserAccountServiceImpl } from '../services/UserAccountService';
import { PaymentService, PaymentServiceImpl } from '../services/PaymentService';

/**
 * Profile command handler for viewing user payment profiles
 */
export class ProfileCommandHandler extends BaseCommandHandler {
    private userAccountService: UserAccountService;
    private paymentService: PaymentService;

    constructor(
        userAccountService?: UserAccountService,
        paymentService?: PaymentService
    ) {
        super();
        this.userAccountService = userAccountService || new UserAccountServiceImpl();
        this.paymentService = paymentService || new PaymentServiceImpl();
    }

    public getCommandName(): string {
        return 'profile';
    }

    public validateParameters(interaction: CommandInteraction): boolean {
        return super.validateParameters(interaction);
    }

    public async handle(interaction: CommandInteraction): Promise<void> {
        try {
            await this.deferReply(interaction, true); // Ephemeral for privacy

            // Get target user (default to command user)
            const targetUser = interaction.isChatInputCommand() 
                ? (interaction.options.getUser('user') || interaction.user)
                : interaction.user;
            const targetUserId = targetUser.id;
            const isOwnProfile = targetUserId === interaction.user.id;

            // Check if target user has an account
            const userAccount = await this.userAccountService.getAccount(targetUserId);
            if (!userAccount) {
                const message = isOwnProfile 
                    ? '❌ You don\'t have a payment account set up yet. Use `/setup-payment` to get started!'
                    : `❌ ${targetUser.username} doesn't have a payment account set up yet.`;
                
                await this.safeReply(interaction, {
                    content: message,
                    ephemeral: true
                });
                return;
            }

            // Get user's activity data
            const activityData = await this.paymentService.getUserActivity(targetUserId);

            // Create profile embed
            const embed = new EmbedBuilder()
                .setColor(0x9B59B6) // Purple for profile
                .setTitle(`🐷 ${targetUser.username}'s Payment Profile 🐽`)
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    { 
                        name: '💰 Total Sent', 
                        value: `$${activityData.totalSent.toFixed(2)}`, 
                        inline: true 
                    },
                    { 
                        name: '🏦 Account Status', 
                        value: userAccount.isSetupComplete ? '✅ Active' : '⚠️ Setup Required', 
                        inline: true 
                    },
                    { 
                        name: '📅 Member Since', 
                        value: `<t:${Math.floor(userAccount.createdAt.getTime() / 1000)}:R>`, 
                        inline: true 
                    },
                    { 
                        name: '💳 Payment Methods', 
                        value: `${userAccount.paymentMethods.length} method(s) configured`, 
                        inline: true 
                    },
                    { 
                        name: '📊 Total Transactions', 
                        value: `${activityData.totalTransactions}`, 
                        inline: true 
                    },
                    { 
                        name: '🔄 Last Activity', 
                        value: userAccount.lastActivityAt 
                            ? `<t:${Math.floor(userAccount.lastActivityAt.getTime() / 1000)}:R>`
                            : 'Never', 
                        inline: true 
                    }
                )
                .setFooter({ text: 'Oink Bot - Your friendly piggy payment assistant! 🐷💰' })
                .setTimestamp();

            // Add transaction summary if user has transactions
            if (activityData.totalTransactions > 0) {
                embed.addFields({
                    name: '📈 Transaction Summary',
                    value: `**Sent:** $${activityData.totalSent.toFixed(2)}\n**Received:** $${activityData.totalReceived.toFixed(2)}\n**Net:** $${(activityData.totalReceived - activityData.totalSent).toFixed(2)}`,
                    inline: false
                });
            }

            // Add payment methods info (only show for own profile or if public)
            if (isOwnProfile || userAccount.isPublicProfile) {
                const paymentMethodsInfo = userAccount.paymentMethods.length > 0
                    ? userAccount.paymentMethods.map(method => `• ${method.type} (${method.isActive ? '✅' : '❌'})`).join('\n')
                    : 'No payment methods configured';

                embed.addFields({
                    name: '💳 Payment Methods',
                    value: paymentMethodsInfo,
                    inline: false
                });
            }

            await this.safeReply(interaction, { embeds: [embed], ephemeral: true });

        } catch (error) {
            console.error('Error handling profile command:', error);
            await this.safeReply(interaction, {
                content: '❌ Oink... something went wrong while fetching the profile. Please try again!',
                ephemeral: true
            });
        }
    }
}
