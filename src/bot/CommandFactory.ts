import { SlashCommandBuilder, SlashCommandSubcommandBuilder } from 'discord.js';
import { CommandDefinition, CommandCategory } from './CommandRegistry';

export interface CommandOption {
    name: string;
    description: string;
    required: boolean;
    type: 'string' | 'number' | 'integer' | 'boolean' | 'user' | 'channel' | 'role';
    minValue?: number;
    maxValue?: number;
    choices?: { name: string; value: string | number }[];
}

export interface CommandConfig {
    name: string;
    description: string;
    category: CommandCategory;
    permissions?: string[];
    cooldown?: number;
    guildOnly?: boolean;
    options?: CommandOption[];
    subcommands?: CommandConfig[];
    aliases?: string[];
    examples?: string[];
    usage?: string;
    longDescription?: string;
    requiresSetup?: boolean;
    isEphemeral?: boolean;
    maxUses?: number;
    minLevel?: number;
}

export class CommandFactory {
    public static createCommand(config: CommandConfig): CommandDefinition {
        const builder = new SlashCommandBuilder()
            .setName(config.name)
            .setDescription(config.description);

        // Add options
        if (config.options) {
            config.options.forEach(option => {
                switch (option.type) {
                    case 'string':
                        builder.addStringOption(opt => {
                            opt.setName(option.name)
                               .setDescription(option.description)
                               .setRequired(option.required);
                            
                            if (option.choices) {
                                // Filter choices to only include string values for string options
                                const stringChoices = option.choices
                                    .filter(choice => typeof choice.value === 'string')
                                    .map(choice => ({ name: choice.name, value: choice.value as string }));
                                opt.addChoices(...stringChoices);
                            }
                            return opt;
                        });
                        break;
                    
                    case 'number':
                        builder.addNumberOption(opt => {
                            opt.setName(option.name)
                               .setDescription(option.description)
                               .setRequired(option.required);
                            
                            if (option.minValue !== undefined) {
                                opt.setMinValue(option.minValue);
                            }
                            if (option.maxValue !== undefined) {
                                opt.setMaxValue(option.maxValue);
                            }
                            return opt;
                        });
                        break;
                    
                    case 'integer':
                        builder.addIntegerOption(opt => {
                            opt.setName(option.name)
                               .setDescription(option.description)
                               .setRequired(option.required);
                            
                            if (option.minValue !== undefined) {
                                opt.setMinValue(option.minValue);
                            }
                            if (option.maxValue !== undefined) {
                                opt.setMaxValue(option.maxValue);
                            }
                            return opt;
                        });
                        break;
                    
                    case 'boolean':
                        builder.addBooleanOption(opt => {
                            opt.setName(option.name)
                               .setDescription(option.description)
                               .setRequired(option.required);
                            return opt;
                        });
                        break;
                    
                    case 'user':
                        builder.addUserOption(opt => {
                            opt.setName(option.name)
                               .setDescription(option.description)
                               .setRequired(option.required);
                            return opt;
                        });
                        break;
                    
                    case 'channel':
                        builder.addChannelOption(opt => {
                            opt.setName(option.name)
                               .setDescription(option.description)
                               .setRequired(option.required);
                            return opt;
                        });
                        break;
                    
                    case 'role':
                        builder.addRoleOption(opt => {
                            opt.setName(option.name)
                               .setDescription(option.description)
                               .setRequired(option.required);
                            return opt;
                        });
                        break;
                }
            });
        }

        // Add subcommands
        if (config.subcommands) {
            config.subcommands.forEach(subcommand => {
                const subBuilder = new SlashCommandSubcommandBuilder()
                    .setName(subcommand.name)
                    .setDescription(subcommand.description);
                
                // Add subcommand options
                if (subcommand.options) {
                    // TODO: Implement subcommand option handling
                    // Similar option handling for subcommands
                    // (Implementation would be similar to above)
                }
                
                builder.addSubcommand(subBuilder);
            });
        }

        // Set permissions if specified
        if (config.permissions) {
            builder.setDefaultMemberPermissions(config.permissions.join(''));
        }

        // Set guild only if specified
        if (config.guildOnly) {
            builder.setDMPermission(false);
        }

        return {
            name: config.name,
            description: config.description,
            builder: builder,
            category: config.category,
            permissions: config.permissions,
            cooldown: config.cooldown,
            guildOnly: config.guildOnly,
            aliases: config.aliases,
            examples: config.examples,
            usage: config.usage,
            longDescription: config.longDescription,
            requiresSetup: config.requiresSetup,
            isEphemeral: config.isEphemeral,
            maxUses: config.maxUses,
            minLevel: config.minLevel
        };
    }

    // Convenience methods for common command types
    public static createPaymentCommand(name: string, description: string, options?: CommandOption[], metadata?: Partial<CommandDefinition>): CommandDefinition {
        return this.createCommand({
            name,
            description,
            category: CommandCategory.PAYMENT,
            options,
            ...metadata
        });
    }

    public static createUtilityCommand(name: string, description: string, options?: CommandOption[], metadata?: Partial<CommandDefinition>): CommandDefinition {
        return this.createCommand({
            name,
            description,
            category: CommandCategory.UTILITY,
            options,
            ...metadata
        });
    }

    public static createAdminCommand(name: string, description: string, options?: CommandOption[], metadata?: Partial<CommandDefinition>): CommandDefinition {
        return this.createCommand({
            name,
            description,
            category: CommandCategory.CONFIG,
            permissions: ['0'], // Admin only
            options,
            ...metadata
        });
    }
}
