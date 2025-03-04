'use strict';

const Support   = require('../support');
const { DataTypes } = require('@sequelize/core');

const expectsql = Support.expectsql;
const current   = Support.sequelize;
const sql       = current.dialect.queryGenerator;
const _         = require('lodash');

describe(Support.getTestDialectTeaser('SQL'), () => {
  if (current.dialect.name === 'snowflake') {
    return;
  }

  describe('createTable', () => {
    const FooUser = current.define('user', {
      mood: DataTypes.ENUM('happy', 'sad'),
    }, {
      schema: 'foo',
      timestamps: false,
    });

    describe('with enums', () => {
      it('references enum in the right schema #3171', () => {
        expectsql(sql.createTableQuery(FooUser.getTableName(), sql.attributesToSQL(FooUser.rawAttributes), {}), {
          sqlite: 'CREATE TABLE IF NOT EXISTS `foo.users` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `mood` TEXT);',
          db2: 'CREATE TABLE IF NOT EXISTS "foo"."users" ("id" INTEGER NOT NULL GENERATED BY DEFAULT AS IDENTITY(START WITH 1, INCREMENT BY 1) , "mood" VARCHAR(255) CHECK ("mood" IN(\'happy\', \'sad\')), PRIMARY KEY ("id"));',
          postgres: 'CREATE TABLE IF NOT EXISTS "foo"."users" ("id"   SERIAL , "mood" "foo"."enum_users_mood", PRIMARY KEY ("id"));',
          'mariadb mysql': 'CREATE TABLE IF NOT EXISTS `foo`.`users` (`id` INTEGER NOT NULL auto_increment , `mood` ENUM(\'happy\', \'sad\'), PRIMARY KEY (`id`)) ENGINE=InnoDB;',
          mssql: 'IF OBJECT_ID(\'[foo].[users]\', \'U\') IS NULL CREATE TABLE [foo].[users] ([id] INTEGER NOT NULL IDENTITY(1,1) , [mood] VARCHAR(255) CHECK ([mood] IN(N\'happy\', N\'sad\')), PRIMARY KEY ([id]));',
          ibmi: `BEGIN
    DECLARE CONTINUE HANDLER FOR SQLSTATE VALUE '42710'
      BEGIN END;
      CREATE TABLE "foo"."users" ("id" INTEGER NOT NULL GENERATED BY DEFAULT AS IDENTITY (START WITH 1, INCREMENT BY 1) , "mood" VARCHAR(255) CHECK ("mood" IN('happy', 'sad')), PRIMARY KEY ("id"));
      END`,
        });
      });
    });

    describe('with references', () => {
      const BarUser = current.define('user', {
        timestamps: false,
      }).schema('bar');

      const BarProject = current.define('project', {
        user_id: {
          type: DataTypes.INTEGER,
          references: { model: BarUser },
          onUpdate: 'CASCADE',
          onDelete: 'NO ACTION',
        },
      }, {
        timestamps: false,
      }).schema('bar');

      BarProject.belongsTo(BarUser, { foreignKey: 'user_id' });

      it('references right schema when adding foreign key #9029', () => {
        expectsql(sql.createTableQuery(BarProject.getTableName(), sql.attributesToSQL(BarProject.rawAttributes), {}), {
          sqlite: 'CREATE TABLE IF NOT EXISTS `bar.projects` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `user_id` INTEGER REFERENCES `bar.users` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE);',
          db2: 'CREATE TABLE IF NOT EXISTS "bar"."projects" ("id" INTEGER NOT NULL GENERATED BY DEFAULT AS IDENTITY(START WITH 1, INCREMENT BY 1) , "user_id" INTEGER, PRIMARY KEY ("id"), FOREIGN KEY ("user_id") REFERENCES "bar"."users" ("id") ON DELETE NO ACTION);',
          postgres: 'CREATE TABLE IF NOT EXISTS "bar"."projects" ("id"   SERIAL , "user_id" INTEGER REFERENCES "bar"."users" ("id") ON DELETE NO ACTION ON UPDATE CASCADE, PRIMARY KEY ("id"));',
          'mariadb mysql': 'CREATE TABLE IF NOT EXISTS `bar`.`projects` (`id` INTEGER NOT NULL auto_increment , `user_id` INTEGER, PRIMARY KEY (`id`), FOREIGN KEY (`user_id`) REFERENCES `bar`.`users` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE) ENGINE=InnoDB;',
          mssql: 'IF OBJECT_ID(\'[bar].[projects]\', \'U\') IS NULL CREATE TABLE [bar].[projects] ([id] INTEGER NOT NULL IDENTITY(1,1) , [user_id] INTEGER NULL, PRIMARY KEY ([id]), FOREIGN KEY ([user_id]) REFERENCES [bar].[users] ([id]) ON DELETE NO ACTION);',
          ibmi: `BEGIN
    DECLARE CONTINUE HANDLER FOR SQLSTATE VALUE '42710'
      BEGIN END;
      CREATE TABLE "bar"."projects" ("id" INTEGER NOT NULL GENERATED BY DEFAULT AS IDENTITY (START WITH 1, INCREMENT BY 1) , "user_id" INTEGER REFERENCES "bar"."users" ("id") ON DELETE NO ACTION, PRIMARY KEY ("id"));
      END`,
        });
      });
    });

    describe('with references on primary key', () => {
      const File = current.define('file', {}, { timestamps: false });
      const Image = current.define('image', {
        id: {
          primaryKey: true,
          autoIncrement: true,
          type: DataTypes.INTEGER,
          references: {
            model: File,
            key: 'id',
          },
        },
      }, {
        timestamps: false,
      });

      it('references on primary key #9461', () => {
        expectsql(sql.createTableQuery(Image.getTableName(), sql.attributesToSQL(Image.rawAttributes), {}), {
          sqlite: 'CREATE TABLE IF NOT EXISTS `images` (`id` INTEGER PRIMARY KEY AUTOINCREMENT REFERENCES `files` (`id`));',
          postgres: 'CREATE TABLE IF NOT EXISTS "images" ("id"  SERIAL  REFERENCES "files" ("id"), PRIMARY KEY ("id"));',
          db2: 'CREATE TABLE IF NOT EXISTS "images" ("id" INTEGER NOT NULL GENERATED BY DEFAULT AS IDENTITY(START WITH 1, INCREMENT BY 1) , PRIMARY KEY ("id"), FOREIGN KEY ("id") REFERENCES "files" ("id"));',
          mariadb: 'CREATE TABLE IF NOT EXISTS `images` (`id` INTEGER auto_increment , PRIMARY KEY (`id`), FOREIGN KEY (`id`) REFERENCES `files` (`id`)) ENGINE=InnoDB;',
          mysql: 'CREATE TABLE IF NOT EXISTS `images` (`id` INTEGER auto_increment , PRIMARY KEY (`id`), FOREIGN KEY (`id`) REFERENCES `files` (`id`)) ENGINE=InnoDB;',
          mssql: 'IF OBJECT_ID(\'[images]\', \'U\') IS NULL CREATE TABLE [images] ([id] INTEGER IDENTITY(1,1) , PRIMARY KEY ([id]), FOREIGN KEY ([id]) REFERENCES [files] ([id]));',
          ibmi: `BEGIN
    DECLARE CONTINUE HANDLER FOR SQLSTATE VALUE '42710'
      BEGIN END;
      CREATE TABLE "images" ("id" INTEGER GENERATED BY DEFAULT AS IDENTITY (START WITH 1, INCREMENT BY 1)  REFERENCES "files" ("id"), PRIMARY KEY ("id"));
      END`,
        });
      });
    });

    if (current.dialect.name === 'postgres') {
      describe('IF NOT EXISTS version check', () => {
        const modifiedSQL = _.clone(sql);
        const createTableQueryModified = sql.createTableQuery.bind(modifiedSQL);
        it('it will not have IF NOT EXISTS for version 9.0 or below', () => {
          modifiedSQL.sequelize.options.databaseVersion = '9.0.0';
          expectsql(createTableQueryModified(FooUser.getTableName(), sql.attributesToSQL(FooUser.rawAttributes), {}), {
            postgres: 'CREATE TABLE "foo"."users" ("id"   SERIAL , "mood" "foo"."enum_users_mood", PRIMARY KEY ("id"));',
          });
        });
        it('it will have IF NOT EXISTS for version 9.1 or above', () => {
          modifiedSQL.sequelize.options.databaseVersion = '9.1.0';
          expectsql(createTableQueryModified(FooUser.getTableName(), sql.attributesToSQL(FooUser.rawAttributes), {}), {
            postgres: 'CREATE TABLE IF NOT EXISTS "foo"."users" ("id"   SERIAL , "mood" "foo"."enum_users_mood", PRIMARY KEY ("id"));',
          });
        });
        it('it will have IF NOT EXISTS for default version', () => {
          modifiedSQL.sequelize.options.databaseVersion = 0;
          expectsql(createTableQueryModified(FooUser.getTableName(), sql.attributesToSQL(FooUser.rawAttributes), {}), {
            postgres: 'CREATE TABLE IF NOT EXISTS "foo"."users" ("id"   SERIAL , "mood" "foo"."enum_users_mood", PRIMARY KEY ("id"));',
          });
        });
      });
    }
  });
});
