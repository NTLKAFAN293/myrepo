
import { Client, GatewayIntentBits, PermissionFlagsBits, ChannelType, ButtonBuilder, ActionRowBuilder, ButtonStyle, EmbedBuilder, REST, Routes, SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import crypto from 'crypto';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
});

const CATEGORY_ID = '1436449133584977970';
const RESULTS_CHANNEL_ID = '1436434643510497281';
const PASSWORD = 'aass1122';

const authorizedUsers = new Set();
const authorizedRoles = new Set();

let emailList = [];
let welcomeMessage = 'يا هلا! مرحب فيك بنظام شراء الإيميلات';
let embedTitle = 'شراء إيميلات';
let embedDescription = 'اضغط على زر "بيع" عشان تبدأ تشتري إيميل';

const userSessions = new Map();
const usedImageHashes = new Set();
const pendingVerifications = new Map();

function isAuthorized(member) {
  if (member.guild.ownerId === member.id) {
    return true;
  }
  
  if (authorizedUsers.has(member.id)) {
    return true;
  }
  
  for (const roleId of authorizedRoles) {
    if (member.roles.cache.has(roleId)) {
      return true;
    }
  }
  
  return false;
}

const commands = [
  new SlashCommandBuilder()
    .setName('add-admin')
    .setDescription('إضافة شخص أو رتبة للمسؤولين (لصاحب السيرفر فقط)')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('الشخص المراد إضافته')
        .setRequired(false)
    )
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('الرتبة المراد إضافتها')
        .setRequired(false)
    ),
  
  new SlashCommandBuilder()
    .setName('remove-admin')
    .setDescription('إزالة شخص أو رتبة من المسؤولين (لصاحب السيرفر فقط)')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('الشخص المراد إزالته')
        .setRequired(false)
    )
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('الرتبة المراد إزالتها')
        .setRequired(false)
    ),
  
  new SlashCommandBuilder()
    .setName('list-admins')
    .setDescription('عرض قائمة المسؤولين المصرح لهم (لصاحب السيرفر فقط)'),
  
  new SlashCommandBuilder()
    .setName('add-emails')
    .setDescription('إضافة إيميلات جديدة (للمسؤولين فقط)')
    .addStringOption(option =>
      option.setName('emails')
        .setDescription('قائمة الإيميلات (افصل بينها بفواصل)')
        .setRequired(true)
    ),
  
  new SlashCommandBuilder()
    .setName('set-welcome')
    .setDescription('تعيين رسالة الترحيب (للمسؤولين فقط)')
    .addStringOption(option =>
      option.setName('message')
        .setDescription('رسالة الترحيب الجديدة')
        .setRequired(true)
    ),
  
  new SlashCommandBuilder()
    .setName('send-embed')
    .setDescription('إرسال embed مع زر البيع (للمسؤولين فقط)')
    .addStringOption(option =>
      option.setName('title')
        .setDescription('عنوان الـ Embed')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('description')
        .setDescription('وصف الـ Embed')
        .setRequired(true)
    )
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('القناة المراد إرسال الـ Embed فيها')
        .setRequired(true)
    ),
  
  new SlashCommandBuilder()
    .setName('list-emails')
    .setDescription('عرض جميع الإيميلات المتوفرة (للمسؤولين فقط)'),
  
  new SlashCommandBuilder()
    .setName('clear-emails')
    .setDescription('حذف جميع الإيميلات (للمسؤولين فقط)'),
].map(command => command.toJSON());

function hashImageUrl(url) {
  return crypto.createHash('sha256').update(url).digest('hex');
}

function convertArabicToEnglishNumbers(str) {
  const arabicNumbers = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  let result = str;
  arabicNumbers.forEach((arabic, index) => {
    result = result.replace(new RegExp(arabic, 'g'), index.toString());
  });
  return result;
}

client.once('ready', async () => {
  console.log(`✅ البوت جاهز! تم تسجيل الدخول باسم ${client.user.tag}`);
  
  client.user.setPresence({
    activities: [{ name: 'dev', type: 3 }],
    status: 'online'
  });
  
  const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);
  
  try {
    console.log('🔄 جاري حذف الأوامر القديمة وتسجيل الأوامر الجديدة...');
    
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    
    console.log('✅ تم تسجيل الأوامر بنجاح!');
  } catch (error) {
    console.error('❌ خطأ في تسجيل الأوامر:', error);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (['add-admin', 'remove-admin', 'list-admins'].includes(interaction.commandName)) {
      if (interaction.guild.ownerId !== interaction.user.id) {
        return interaction.reply({ content: '❌ هذا الأمر فقط لصاحب السيرفر!', ephemeral: true });
      }

      if (interaction.commandName === 'add-admin') {
        const user = interaction.options.getUser('user');
        const role = interaction.options.getRole('role');
        
        if (!user && !role) {
          return interaction.reply({ content: '❌ لازم تختار شخص أو رتبة!', ephemeral: true });
        }
        
        if (user) {
          authorizedUsers.add(user.id);
          return interaction.reply({ content: `✅ تمت إضافة ${user.tag} للمسؤولين!`, ephemeral: true });
        }
        
        if (role) {
          authorizedRoles.add(role.id);
          return interaction.reply({ content: `✅ تمت إضافة رتبة ${role.name} للمسؤولين!`, ephemeral: true });
        }
      }

      if (interaction.commandName === 'remove-admin') {
        const user = interaction.options.getUser('user');
        const role = interaction.options.getRole('role');
        
        if (!user && !role) {
          return interaction.reply({ content: '❌ لازم تختار شخص أو رتبة!', ephemeral: true });
        }
        
        if (user) {
          authorizedUsers.delete(user.id);
          return interaction.reply({ content: `✅ تمت إزالة ${user.tag} من المسؤولين!`, ephemeral: true });
        }
        
        if (role) {
          authorizedRoles.delete(role.id);
          return interaction.reply({ content: `✅ تمت إزالة رتبة ${role.name} من المسؤولين!`, ephemeral: true });
        }
      }

      if (interaction.commandName === 'list-admins') {
        let adminsList = '📋 **قائمة المسؤولين المصرح لهم:**\n\n';
        
        if (authorizedUsers.size > 0) {
          adminsList += '👤 **الأشخاص:**\n';
          for (const userId of authorizedUsers) {
            const user = await client.users.fetch(userId).catch(() => null);
            adminsList += `- ${user ? user.tag : `معرف: ${userId}`}\n`;
          }
          adminsList += '\n';
        }
        
        if (authorizedRoles.size > 0) {
          adminsList += '🎭 **الرتب:**\n';
          for (const roleId of authorizedRoles) {
            const role = interaction.guild.roles.cache.get(roleId);
            adminsList += `- ${role ? role.name : `معرف: ${roleId}`}\n`;
          }
        }
        
        if (authorizedUsers.size === 0 && authorizedRoles.size === 0) {
          adminsList += '⚠️ ما في مسؤولين مضافين حالياً\n\nفقط صاحب السيرفر يقدر يستخدم الأوامر';
        }
        
        return interaction.reply({ content: adminsList, ephemeral: true });
      }
    }

    const hasPermission = isAuthorized(interaction.member);

    if (interaction.commandName === 'add-emails') {
      if (!hasPermission) {
        return interaction.reply({ content: '❌ ما عندك صلاحية تستخدم هالأمر!', ephemeral: true });
      }

      const emailsInput = interaction.options.getString('emails');
      const emails = emailsInput.split(/[,\n]/).map(e => e.trim()).filter(e => e && e.includes('@'));
      
      if (emails.length === 0) {
        return interaction.reply({ content: '❌ ما لقينا إيميلات صحيحة!', ephemeral: true });
      }

      emailList.push(...emails);
      await interaction.reply({ content: `✅ تم إضافة ${emails.length} إيميل!\nالإجمالي: ${emailList.length}`, ephemeral: true });
    }

    if (interaction.commandName === 'set-welcome') {
      if (!hasPermission) {
        return interaction.reply({ content: '❌ ما عندك صلاحية تستخدم هالأمر!', ephemeral: true });
      }

      const newMessage = interaction.options.getString('message');
      welcomeMessage = newMessage;
      await interaction.reply({ content: '✅ تم تحديث رسالة الترحيب!', ephemeral: true });
    }

    if (interaction.commandName === 'send-embed') {
      if (!hasPermission) {
        return interaction.reply({ content: '❌ ما عندك صلاحية تستخدم هالأمر!', ephemeral: true });
      }

      embedTitle = interaction.options.getString('title');
      embedDescription = interaction.options.getString('description');
      const channel = interaction.options.getChannel('channel');

      const embed = new EmbedBuilder()
        .setTitle(embedTitle)
        .setDescription(embedDescription)
        .setColor(0x5865F2);

      const button = new ButtonBuilder()
        .setCustomId('buy_email')
        .setLabel('بيع')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(button);

      try {
        await channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ تم إرسال الرسالة بنجاح!', ephemeral: true });
      } catch (error) {
        await interaction.reply({ content: '❌ صار خطأ وقت إرسال الرسالة!', ephemeral: true });
      }
    }

    if (interaction.commandName === 'list-emails') {
      if (!hasPermission) {
        return interaction.reply({ content: '❌ ما عندك صلاحية تستخدم هالأمر!', ephemeral: true });
      }

      if (emailList.length === 0) {
        return interaction.reply({ content: '📭 ما في إيميلات مضافة حالياً.', ephemeral: true });
      }

      const emailsText = emailList.map((email, idx) => `${idx + 1}. ${email}`).join('\n');
      const chunks = emailsText.match(/[\s\S]{1,1900}/g) || [];
      
      await interaction.reply({ content: `📧 **الإيميلات المتوفرة (${emailList.length}):**\n\`\`\`\n${chunks[0]}\n\`\`\``, ephemeral: true });
      
      for (let i = 1; i < chunks.length; i++) {
        await interaction.followUp({ content: `\`\`\`\n${chunks[i]}\n\`\`\``, ephemeral: true });
      }
    }

    if (interaction.commandName === 'clear-emails') {
      if (!hasPermission) {
        return interaction.reply({ content: '❌ ما عندك صلاحية تستخدم هالأمر!', ephemeral: true });
      }

      const count = emailList.length;
      emailList = [];
      await interaction.reply({ content: `✅ تم حذف ${count} إيميل!`, ephemeral: true });
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId === 'buy_email') {
      if (emailList.length === 0) {
        return interaction.reply({ content: '❌ معليش، ما في إيميلات متوفرة حالياً!', ephemeral: true });
      }

      const guild = interaction.guild;
      const category = await guild.channels.fetch(CATEGORY_ID);

      if (!category || category.type !== ChannelType.GuildCategory) {
        return interaction.reply({ content: '❌ في خطأ بالكاتاجوري!', ephemeral: true });
      }

      const channelName = `email-${interaction.user.username}`;
      
      const privateChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: CATEGORY_ID,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: interaction.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
          },
          {
            id: client.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
          },
        ],
      });

      userSessions.set(interaction.user.id, {
        channelId: privateChannel.id,
        guildId: guild.id,
        emails: [],
        images: [],
        waitingForImages: false,
        requestedCount: 0
      });

      await interaction.reply({ content: `✅ تم إنشاء روم خاص لك: ${privateChannel}`, ephemeral: true });

      const welcomeEmbed = new EmbedBuilder()
        .setTitle('🎉 يا هلا فيك!')
        .setDescription(
          `**مرحباً بك في نظام شراء الإيميلات** 🌟\n\n` +
          `**كيف يشتغل النظام؟**\n` +
          `1️⃣ اضغط على زر "قبول" عشان توافق على الشراء\n` +
          `2️⃣ اختار عدد الإيميلات اللي تبي تشتريها (من 1 إلى 10)\n` +
          `3️⃣ راح نعطيك الإيميلات مع الباسورد\n` +
          `4️⃣ ارسل صورة كل إيميل من حساب جوجل\n` +
          `5️⃣ راح نراجع الصور ونرسلها للمسؤولين\n\n` +
          `**الباسورد الثابت:** \`${PASSWORD}\`\n\n` +
          `⚠️ **انتبه:** السعر 200k كردت لكل إيميل`
        )
        .setColor(0x00FF00)
        .setTimestamp();

      const acceptButton = new ButtonBuilder()
        .setCustomId('accept_terms')
        .setLabel('قبول')
        .setStyle(ButtonStyle.Success);

      const rejectButton = new ButtonBuilder()
        .setCustomId('reject_terms')
        .setLabel('رفض')
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder().addComponents(acceptButton, rejectButton);

      await privateChannel.send({ content: `${interaction.user}`, embeds: [welcomeEmbed], components: [row] });
    }

    if (interaction.customId === 'accept_terms') {
      const session = userSessions.get(interaction.user.id);
      if (!session || session.channelId !== interaction.channel.id) {
        return interaction.reply({ content: '❌ في خطأ بالجلسة!', ephemeral: true });
      }

      await interaction.update({ content: '✅ تمام! وافقت على الشروط', components: [] });

      const selectEmbed = new EmbedBuilder()
        .setTitle('📊 اختيار عدد الإيميلات')
        .setDescription(
          `**يرجى اختيار عدد الإيميلات التي سوف تقوم بشرائها**\n\n` +
          `📌 **الحد الأدنى:** 1 إيميل\n` +
          `📌 **الحد الأقصى:** 10 إيميلات\n\n` +
          `⬇️ اضغط على الزر بالأسفل عشان تدخل العدد`
        )
        .setColor(0x3498db);

      const selectButton = new ButtonBuilder()
        .setCustomId('select_count')
        .setLabel('🔢 إدخال العدد')
        .setStyle(ButtonStyle.Primary);

      const cancelButton = new ButtonBuilder()
        .setCustomId('cancel_all')
        .setLabel('إلغاء')
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder().addComponents(selectButton, cancelButton);

      await interaction.channel.send({ embeds: [selectEmbed], components: [row] });
    }

    if (interaction.customId === 'reject_terms' || interaction.customId === 'cancel_all') {
      const session = userSessions.get(interaction.user.id);
      
      if (session && session.emails && session.emails.length > 0) {
        emailList.unshift(...session.emails);
      }
      
      if (session && session.images && session.images.length > 0) {
        for (const item of session.images) {
          usedImageHashes.delete(item.imageHash);
        }
      }
      
      await interaction.update({ content: '❌ تم إلغاء العملية', components: [] });
      
      setTimeout(async () => {
        await interaction.channel.delete();
        userSessions.delete(interaction.user.id);
      }, 3000);
    }

    if (interaction.customId === 'select_count') {
      try {
        const modal = new ModalBuilder()
          .setCustomId('count_modal')
          .setTitle('إدخال عدد الإيميلات');

        const countInput = new TextInputBuilder()
          .setCustomId('email_count')
          .setLabel('كم إيميل تبي؟ (من 1 إلى 10)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('مثال: 5 أو ٥')
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(2);

        const firstRow = new ActionRowBuilder().addComponents(countInput);
        modal.addComponents(firstRow);

        await interaction.showModal(modal);
      } catch (error) {
        console.error('خطأ في فتح Modal:', error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ 
            content: '❌ حدث خطأ في فتح النافذة. حاول مرة ثانية.', 
            ephemeral: true 
          });
        }
      }
    }

    if (interaction.customId.startsWith('approve_single_')) {
      const parts = interaction.customId.split('_');
      const imageIndex = parseInt(parts[2]);
      const userId = parts[3];
      
      const session = userSessions.get(userId);
      if (!session) {
        return interaction.reply({ content: '❌ انتهت الجلسة!', ephemeral: true });
      }

      let hasPermission = false;
      
      try {
        const guild = await client.guilds.fetch(session.guildId);
        const member = await guild.members.fetch(interaction.user.id);
        hasPermission = isAuthorized(member);
      } catch (error) {
        console.error('خطأ في جلب المعلومات من السيرفر:', error);
        return interaction.reply({ 
          content: '❌ صار خطأ بالتحقق من صلاحياتك. تأكد إنك موجود بالسيرفر!', 
          ephemeral: true 
        });
      }

      if (!hasPermission) {
        return interaction.reply({ 
          content: `❌ ما عندك صلاحية!`, 
          ephemeral: true 
        });
      }

      if (!session.images[imageIndex]) {
        return interaction.reply({ content: '❌ الصورة غير موجودة!', ephemeral: true });
      }

      session.images[imageIndex].approved = true;

      await interaction.update({ 
        content: `✅ **تمت الموافقة على الصورة ${imageIndex + 1} من قبل ${interaction.user.tag}**`, 
        components: [] 
      });

      const allApproved = session.images.every(img => img.approved === true);
      
      if (allApproved) {
        const channel = await client.channels.fetch(session.channelId);
        await channel.send(`🎉 **مبروك! تمت الموافقة على جميع الإيميلات (${session.images.length}/${session.requestedCount})**`);

        const resultsChannel = await client.channels.fetch(RESULTS_CHANNEL_ID);
        const emailsList = session.images.map((item, idx) => `${idx + 1}. ${item.email}`).join('\n');
        await resultsChannel.send(
          `✅ **تحقق ناجح**\n` +
          `👤 المستخدم: ${(await client.users.fetch(userId)).tag}\n` +
          `📧 عدد الإيميلات: ${session.images.length}\n` +
          `✅ وافق: ${interaction.user.tag}\n\n` +
          `**الإيميلات:**\n${emailsList}`
        );

        setTimeout(async () => {
          try {
            await channel.send('✨ **شكراً لك! سيتم حذف الروم بعد 30 ثانية...**');
            setTimeout(async () => {
              await channel.delete();
              userSessions.delete(userId);
            }, 30000);
          } catch (e) {
            console.error('خطأ في حذف القناة:', e);
          }
        }, 3000);
      }
    }

    if (interaction.customId.startsWith('reject_single_')) {
      const parts = interaction.customId.split('_');
      const imageIndex = parseInt(parts[2]);
      const userId = parts[3];
      
      const session = userSessions.get(userId);
      if (!session) {
        return interaction.reply({ content: '❌ انتهت الجلسة!', ephemeral: true });
      }

      let hasPermission = false;
      
      try {
        const guild = await client.guilds.fetch(session.guildId);
        const member = await guild.members.fetch(interaction.user.id);
        hasPermission = isAuthorized(member);
      } catch (error) {
        console.error('خطأ في جلب المعلومات من السيرفر:', error);
        return interaction.reply({ 
          content: '❌ صار خطأ بالتحقق من صلاحياتك. تأكد إنك موجود بالسيرفر!', 
          ephemeral: true 
        });
      }

      if (!hasPermission) {
        return interaction.reply({ 
          content: `❌ ما عندك صلاحية!`, 
          ephemeral: true 
        });
      }

      const rejectedEmail = session.images[imageIndex].email;
      const rejectedHash = session.images[imageIndex].imageHash;
      
      emailList.unshift(rejectedEmail);
      usedImageHashes.delete(rejectedHash);

      await interaction.update({ 
        content: `❌ **تم رفض الصورة ${imageIndex + 1} من قبل ${interaction.user.tag}**`, 
        components: [] 
      });

      const channel = await client.channels.fetch(session.channelId);
      await channel.send(
        `❌ **تم رفض الصورة رقم ${imageIndex + 1} (${rejectedEmail}) من قبل ${interaction.user.tag}**\n\n` +
        `سيتم إغلاق الروم بعد 10 ثوانٍ...`
      );

      setTimeout(async () => {
        try {
          await channel.delete();
          userSessions.delete(userId);
        } catch (e) {
          console.error('خطأ في حذف القناة:', e);
        }
      }, 10000);

      const resultsChannel = await client.channels.fetch(RESULTS_CHANNEL_ID);
      await resultsChannel.send(
        `⚠️ **صورة مرفوضة**\n` +
        `👤 المستخدم: ${(await client.users.fetch(userId)).tag}\n` +
        `📧 الإيميل المرفوض: ${rejectedEmail}\n` +
        `❌ رفض: ${interaction.user.tag}`
      );
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'count_modal') {
      const session = userSessions.get(interaction.user.id);
      if (!session || session.channelId !== interaction.channel.id) {
        return interaction.reply({ content: '❌ في خطأ بالجلسة!', ephemeral: true });
      }

      let countInput = interaction.fields.getTextFieldValue('email_count');
      countInput = convertArabicToEnglishNumbers(countInput);
      const count = parseInt(countInput);

      if (isNaN(count) || count < 1 || count > 10) {
        return interaction.reply({ 
          content: '❌ الرجاء إدخال رقم صحيح من 1 إلى 10!', 
          ephemeral: true 
        });
      }

      if (emailList.length < count) {
        return interaction.reply({ 
          content: `❌ معليش، ما عندنا ${count} إيميل! متوفر فقط ${emailList.length} إيميل`, 
          ephemeral: true 
        });
      }

      session.requestedCount = count;
      const selectedEmails = emailList.splice(0, count);
      session.emails = selectedEmails;
      session.waitingForImages = true;

      await interaction.reply({ content: `✅ تمام! اخترت ${count} إيميل`, ephemeral: true });

      const emailsEmbed = new EmbedBuilder()
        .setTitle(`📧 الإيميلات المطلوبة (${count})`)
        .setDescription(
          selectedEmails.map((email, idx) => 
            `**${idx + 1}.** \`${email}\`\n**الباسورد:** \`${PASSWORD}\``
          ).join('\n\n')
        )
        .setColor(0x3498db)
        .setFooter({ text: 'ارسل صورة كل إيميل من حساب جوجل' });

      await interaction.channel.send({ embeds: [emailsEmbed] });

      const instructionEmbed = new EmbedBuilder()
        .setTitle('📝 التعليمات')
        .setDescription(
          `**الآن ارسل ${count} صورة:**\n\n` +
          `✅ كل صورة لازم تكون من حساب جوجل\n` +
          `✅ لازم الإيميل واضح في الصورة\n` +
          `✅ الصورة لازم تطابق الإيميل المطلوب\n\n` +
          `📸 **ابدأ بإرسال الصور الحين**`
        )
        .setColor(0xFFAA00);

      await interaction.channel.send({ embeds: [instructionEmbed] });
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const session = userSessions.get(message.author.id);
  
  if (session && session.channelId === message.channel.id && session.waitingForImages) {
    if (message.attachments.size === 0) {
      return;
    }

    const attachment = message.attachments.first();
    if (!attachment.contentType?.startsWith('image/')) {
      return message.reply('❌ ارسل صورة بس!');
    }

    const imageHash = hashImageUrl(attachment.url);
    
    if (usedImageHashes.has(imageHash)) {
      return message.reply('❌ **هالصورة مستخدمة من قبل!** ارسل صورة جديدة');
    }

    const currentIndex = session.images.length;
    
    if (currentIndex >= session.requestedCount) {
      return message.reply(`❌ **وصلت للحد الأقصى!** طلبت ${session.requestedCount} إيميل فقط`);
    }

    const email = session.emails[currentIndex];
    
    usedImageHashes.add(imageHash);
    
    session.images.push({
      email: email,
      imageUrl: attachment.url,
      imageHash: imageHash,
      approved: false
    });

    const confirmEmbed = new EmbedBuilder()
      .setTitle(`✅ تم استلام الصورة ${currentIndex + 1}`)
      .setDescription(
        `📊 **التقدم:** ${session.images.length}/${session.requestedCount}\n\n` +
        `${session.images.length < session.requestedCount ? '✨ ارسل الصورة التالية' : '🎉 خلصت جميع الصور! جاري إرسالها للمسؤولين...'}`
      )
      .setColor(0x00FF00)
      .setThumbnail(attachment.url);

    await message.reply({ embeds: [confirmEmbed] });

    if (session.images.length === session.requestedCount) {
      session.waitingForImages = false;
      
      await message.channel.send(`⏳ **جاري إرسال ${session.images.length} صورة للمسؤولين للمراجعة...**`);

      const guild = await client.guilds.fetch(session.guildId);
      const admins = guild.members.cache.filter(m => isAuthorized(m));
      
      for (const [, admin] of admins) {
        try {
          const mainEmbed = new EmbedBuilder()
            .setTitle('📧 طلب تحقق جديد')
            .setDescription(
              `**المستخدم:** ${message.author.tag}\n` +
              `**عدد الإيميلات:** ${session.images.length}\n\n` +
              `⚠️ **راجع كل صورة بعناية**`
            )
            .setColor(0xFFAA00)
            .setTimestamp();

          await admin.send({ embeds: [mainEmbed] });

          for (let i = 0; i < session.images.length; i++) {
            const item = session.images[i];
            
            const imageEmbed = new EmbedBuilder()
              .setTitle(`📸 صورة ${i + 1} من ${session.images.length}`)
              .setDescription(
                `**الإيميل المطلوب:**\n\`${item.email}\`\n\n` +
                `**تحقق:** هل الإيميل في الصورة يطابق هالإيميل؟`
              )
              .setImage(item.imageUrl)
              .setColor(0x3498db)
              .setFooter({ text: `رقم ${i + 1}` });

            const approveButton = new ButtonBuilder()
              .setCustomId(`approve_single_${i}_${message.author.id}`)
              .setLabel('✅ قبول')
              .setStyle(ButtonStyle.Success);

            const rejectButton = new ButtonBuilder()
              .setCustomId(`reject_single_${i}_${message.author.id}`)
              .setLabel('❌ رفض')
              .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder().addComponents(approveButton, rejectButton);

            await admin.send({ embeds: [imageEmbed], components: [row] });
          }
          
          console.log(`✅ تم إرسال طلب التحقق إلى ${admin.user.tag}`);
        } catch (error) {
          console.error(`❌ فشل إرسال DM إلى ${admin.user.tag}:`, error.message);
        }
      }

      await message.channel.send(`✅ **تم إرسال ${session.images.length} صورة للمسؤولين!**\n\n⏳ انتظر المراجعة...`);
    }
  }
});

const DISCORD_BOT_TOKEN = 'ضع_توكن_البوت_هنا';

client.login(DISCORD_BOT_TOKEN).catch(error => {
  console.error('❌ خطأ في تسجيل الدخول:', error);
});
