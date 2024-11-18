import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { Client } from "pg";

const dynamoClient = new DynamoDBClient({ region: "us-east-1" });
const rdsConfig = {
  user: "postgres",
  host: "flyersdb.ct2mjr8ffbfx.us-east-1.rds.amazonaws.com",
  database: "postgres",
  password: "postgres",
  port: 5432,
};

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const { evento, tarjeta, cantidad } = body;
    const id_transaccion = event.requestContext.requestId;

    if (!["Visa", "Master"].includes(tarjeta.tipo)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Tarjeta no válida" }),
      };
    }

    const dynamoParams = {
      TableName: "ventas",
      Item: {
        id_transaccion: { S: id_transaccion },
      },
      ConditionExpression: "attribute_not_exists(id_transaccion)",
    };

    try {
      await dynamoClient.send(new PutItemCommand(dynamoParams));
    } catch (err) {
      if (err.name === "ConditionalCheckFailedException") {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Transacción ya procesada" }),
        };
      }
      throw err;
    }

    const client = new Client(rdsConfig);
    await client.connect();

    const res = await client.query(
      "SELECT entradas_disponibles FROM eventos WHERE nombre_evento = $1",
      [evento]
    );

    if (res.rows.length === 0 || res.rows[0].entradas_disponibles < cantidad) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Entradas insuficientes" }),
      };
    }

    await client.query(
      "UPDATE eventos SET entradas_disponibles = entradas_disponibles - $1 WHERE nombre_evento = $2",
      [cantidad, evento]
    );

    await client.end();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Venta procesada con éxito" }),
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error interno del servidor" + error }),
    };
  }
};
