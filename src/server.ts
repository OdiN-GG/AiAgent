import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import { PrismaClient, Agendamento } from '../generated/prisma'; // ✔️ Client oficial
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

import { isEqual, setHours, setMinutes, setSeconds } from 'date-fns';

function getHorariosDisponiveis(agendamentos: Agendamento[]): string[] {
  const hoje = new Date(); // Considera a data de hoje
  const horariosPossiveis: Date[] = [];

  for (let hora = 9; hora <= 17; hora++) {
    const horario = setSeconds(setMinutes(setHours(hoje, hora), 0), 0);
    horariosPossiveis.push(horario);
  }

  const agendados = agendamentos.map((a) => new Date(a.horario));

  const disponiveis = horariosPossiveis.filter((horario) => {
    return !agendados.some((ag) => isEqual(horario.getTime(), ag.getTime()));
  });

  return disponiveis.map((d) => d.toISOString());
}

const app = express();
const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(bodyParser.json());

app.post('/webhook', async (req, res) => {
  const { phone, message } = req.body;

  try {
    const agendamentos = await prisma.agendamento.findMany(); // tipo inferido automaticamente

    const horariosDisponiveis = getHorariosDisponiveis(agendamentos);

    const prompt = `O cliente disse: "${message}". Estes são os horários **disponíveis** hoje entre 9h e 17h: ${horariosDisponiveis.join(', ')}. Qual horário deseja agendar?`;


    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
    });

    const resposta = completion.choices[0].message?.content ?? 'Não entendi. Pode repetir?';

    await axios.post(
      `https://api.z-api.io/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_TOKEN}/send-message`,
      {
        phone,
        message: resposta,
      }
    );

    res.status(200).send('Mensagem enviada com sucesso.');
  } catch (error) {
    console.error('Erro no webhook:', error);
    res.status(500).send('Erro ao processar mensagem.');
  }
});

app.listen(3000, () => {
  console.log('Servidor rodando na porta 3000');
});
