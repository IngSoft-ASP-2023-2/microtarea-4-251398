import AWS from "aws-sdk";
import { Client } from "pg";

const s3 = new AWS.S3();

const dbConfig = {
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
};

export const handler = async (event) => {
  try {
    for (const record of event.Records) {
      const bucketName = record.s3.bucket.name;
      const objectKey = record.s3.object.key;
      const fileUrl = `https://${bucketName}.s3.amazonaws.com/${objectKey}`;
      const event = objectKey.split(".")[0];

      console.log(
        `Nuevo objeto en S3: Bucket - ${bucketName}, Key - ${objectKey}`
      );

      const client = new Client(dbConfig);
      await client.connect();

      const updateQuery = `
        UPDATE eventos
        SET flyer = $1
        WHERE nombre_evento = $2
        RETURNING *;
      `;
      const values = [fileUrl, objectKey];

      const res = await client.query(updateQuery, values);

      if (res.rowCount === 0) {
        console.error(
          `Evento con nombre ${objectKey} no encontrado en la base de datos`
        );
        throw new Error(`Evento con nombre ${objectKey} no encontrado`);
      }

      console.log(
        `Flyer actualizado en la base de datos para el evento: ${objectKey}`
      );
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Flyers actualizados correctamente." }),
    };
  } catch (error) {
    console.error("Error procesando el evento S3:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Error al procesar el evento S3",
        error: error.message,
      }),
    };
  } finally {
    // Cerrar la conexión a la base de datos
    await client.end();
  }
};
